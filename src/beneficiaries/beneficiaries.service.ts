import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  BeneficiaryStatus,
  ContactType,
  PaymentStatus,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnomalyDetectionService } from '../anomalies/anomaly-detection.service';
import {
  buildPaginatedResponse,
  PaginatedResponseDto,
} from '../common/dto/paginated-response.dto';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { BeneficiaryQueryDto } from './dto/beneficiary-query.dto';
import {
  BeneficiaryDetailDto,
  BeneficiaryListItemDto,
  BeneficiaryMutationResponseDto,
  DuplicateWarningDto,
} from './dto/beneficiary-response.dto';
import {
  AnomaliesSummary,
  beneficiaryDetailInclude,
  beneficiaryListInclude,
  PaymentSummary,
  toBeneficiaryDetail,
  toBeneficiaryListItem,
} from './beneficiaries.mapper';

// Business fields tracked in BeneficiaryHistory snapshots/diffs. Timestamps and
// internal ids are intentionally excluded.
const TRACKED_FIELDS = [
  'fullName',
  'nni',
  'gender',
  'birthDate',
  'localityId',
  'status',
  'source',
  'notes',
] as const;

const REGISTRY_CODE_MAX_RETRIES = 5;

@Injectable()
export class BeneficiariesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anomalyDetection: AnomalyDetectionService,
  ) {}

  async findAll(
    query: BeneficiaryQueryDto,
  ): Promise<PaginatedResponseDto<BeneficiaryListItemDto>> {
    const where = this.buildWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.beneficiary.findMany({
        where,
        include: beneficiaryListInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.beneficiary.count({ where }),
    ]);

    return buildPaginatedResponse(
      rows.map(toBeneficiaryListItem),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string): Promise<BeneficiaryDetailDto> {
    const row = await this.prisma.beneficiary.findFirst({
      where: { id, deletedAt: null },
      include: beneficiaryDetailInclude,
    });

    if (!row) {
      throw new NotFoundException('Beneficiary not found');
    }

    const [anomaliesSummary, paymentSummary] = await Promise.all([
      this.getAnomaliesSummary(id),
      this.getPaymentSummary(id),
    ]);

    return toBeneficiaryDetail(row, anomaliesSummary, paymentSummary);
  }

  async create(
    dto: CreateBeneficiaryDto,
    currentUserId: string,
  ): Promise<BeneficiaryMutationResponseDto> {
    await this.assertLocalityExists(dto.localityId);

    const registryCode = await this.resolveRegistryCode(dto.registryCode);

    const created = await this.prisma.$transaction(async (tx) => {
      const beneficiary = await tx.beneficiary.create({
        data: {
          registryCode,
          fullName: dto.fullName,
          nni: dto.nni,
          gender: dto.gender,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          localityId: dto.localityId,
          status: dto.status ?? BeneficiaryStatus.ACTIVE,
          source: dto.source,
          notes: dto.notes,
          contacts: dto.primaryContact
            ? {
                create: {
                  type: dto.primaryContact.type ?? ContactType.PRIMARY,
                  phone: dto.primaryContact.phone,
                  ownerName: dto.primaryContact.ownerName,
                },
              }
            : undefined,
        },
      });

      await tx.beneficiaryHistory.create({
        data: {
          beneficiaryId: beneficiary.id,
          oldValues: Prisma.DbNull,
          newValues: this.snapshot(beneficiary),
          changedById: currentUserId,
          reason: 'created',
        },
      });

      return beneficiary;
    });

    const duplicateWarnings = await this.detectPotentialDuplicates(
      created.id,
      created.nni,
      dto.primaryContact?.phone,
    );

    const detail = await this.findOne(created.id);
    return { ...detail, duplicateWarnings };
  }

  async update(
    id: string,
    dto: UpdateBeneficiaryDto,
    currentUserId: string,
  ): Promise<BeneficiaryMutationResponseDto> {
    const existing = await this.prisma.beneficiary.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Beneficiary not found');
    }

    if (dto.localityId && dto.localityId !== existing.localityId) {
      await this.assertLocalityExists(dto.localityId);
    }

    const data: Prisma.BeneficiaryUpdateInput = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.nni !== undefined) data.nni = dto.nni;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.birthDate !== undefined)
      data.birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
    if (dto.source !== undefined) data.source = dto.source;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.localityId !== undefined)
      data.locality = { connect: { id: dto.localityId } };

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.beneficiary.update({
        where: { id },
        data,
      });

      if (dto.primaryContact) {
        await this.upsertPrimaryContact(tx, id, dto.primaryContact);
      }

      const { oldValues, newValues } = this.diff(existing, updated);

      await tx.beneficiaryHistory.create({
        data: {
          beneficiaryId: id,
          oldValues:
            oldValues === null ? Prisma.JsonNull : (oldValues as Prisma.InputJsonValue),
          newValues:
            newValues === null ? Prisma.JsonNull : (newValues as Prisma.InputJsonValue),
          changedById: currentUserId,
          reason: dto.reason ?? 'updated',
        },
      });
    });

    const duplicateWarnings = await this.detectPotentialDuplicates(
      id,
      dto.nni ?? existing.nni,
      dto.primaryContact?.phone,
    );

    await this.anomalyDetection.detectBeneficiaryModifiedAfterPayment(id);

    const detail = await this.findOne(id);
    return { ...detail, duplicateWarnings };
  }

  async remove(id: string, currentUserId: string): Promise<{ message: string }> {
    const existing = await this.prisma.beneficiary.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Beneficiary not found');
    }

    // Soft delete only. Contacts, documents, history, payments, anomalies and
    // operation assignments are intentionally left untouched.
    await this.prisma.$transaction(async (tx) => {
      await tx.beneficiary.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: BeneficiaryStatus.INACTIVE,
        },
      });

      await tx.beneficiaryHistory.create({
        data: {
          beneficiaryId: id,
          oldValues: { status: existing.status, deletedAt: null },
          newValues: {
            status: BeneficiaryStatus.INACTIVE,
            deletedAt: new Date().toISOString(),
          },
          changedById: currentUserId,
          reason: 'soft delete',
        },
      });
    });

    return { message: 'Beneficiary deactivated' };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildWhere(query: BeneficiaryQueryDto): Prisma.BeneficiaryWhereInput {
    const where: Prisma.BeneficiaryWhereInput = { deletedAt: null };
    const and: Prisma.BeneficiaryWhereInput[] = [];

    if (query.search) {
      and.push({
        OR: [
          { fullName: { contains: query.search, mode: 'insensitive' } },
          { nni: { contains: query.search, mode: 'insensitive' } },
          { registryCode: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    if (query.nni) and.push({ nni: query.nni });
    if (query.status) and.push({ status: query.status });
    if (query.phone)
      and.push({ contacts: { some: { phone: { contains: query.phone } } } });

    if (query.localityId) and.push({ localityId: query.localityId });
    if (query.communeId)
      and.push({ locality: { communeId: query.communeId } });
    if (query.moughataaId)
      and.push({ locality: { commune: { moughataaId: query.moughataaId } } });
    if (query.regionId)
      and.push({
        locality: { commune: { moughataa: { regionId: query.regionId } } },
      });

    if (and.length > 0) where.AND = and;
    return where;
  }

  private async assertLocalityExists(localityId: string): Promise<void> {
    const locality = await this.prisma.locality.findUnique({
      where: { id: localityId },
      select: { id: true },
    });
    if (!locality) {
      throw new BadRequestException('Invalid localityId');
    }
  }

  private async resolveRegistryCode(provided?: string): Promise<string> {
    if (provided) {
      const existing = await this.prisma.beneficiary.findUnique({
        where: { registryCode: provided },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('registryCode already exists');
      }
      return provided;
    }

    for (let attempt = 0; attempt < REGISTRY_CODE_MAX_RETRIES; attempt++) {
      const candidate = this.generateRegistryCode();
      const existing = await this.prisma.beneficiary.findUnique({
        where: { registryCode: candidate },
        select: { id: true },
      });
      if (!existing) {
        return candidate;
      }
    }

    throw new ConflictException(
      'Could not generate a unique registryCode, please retry',
    );
  }

  private generateRegistryCode(): string {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const randomPart = randomBytes(4)
      .toString('hex')
      .toUpperCase()
      .slice(0, 6);
    return `BEN-${datePart}-${randomPart}`;
  }

  private async upsertPrimaryContact(
    tx: Prisma.TransactionClient,
    beneficiaryId: string,
    contact: CreateBeneficiaryDto['primaryContact'] & object,
  ): Promise<void> {
    const existingPrimary = await tx.beneficiaryContact.findFirst({
      where: { beneficiaryId, type: ContactType.PRIMARY },
      orderBy: { createdAt: 'asc' },
    });

    if (existingPrimary) {
      await tx.beneficiaryContact.update({
        where: { id: existingPrimary.id },
        data: {
          phone: contact.phone,
          ownerName: contact.ownerName,
          type: contact.type ?? ContactType.PRIMARY,
        },
      });
    } else {
      await tx.beneficiaryContact.create({
        data: {
          beneficiaryId,
          phone: contact.phone,
          ownerName: contact.ownerName,
          type: contact.type ?? ContactType.PRIMARY,
        },
      });
    }
  }

  private async detectPotentialDuplicates(
    beneficiaryId: string,
    nni?: string | null,
    phone?: string | null,
  ): Promise<DuplicateWarningDto> {
    const [nniCount, phoneCount] = await Promise.all([
      nni
        ? this.prisma.beneficiary.count({
            where: { nni, deletedAt: null, id: { not: beneficiaryId } },
          })
        : Promise.resolve(0),
      phone
        ? this.prisma.beneficiaryContact.count({
            where: {
              phone,
              beneficiary: { deletedAt: null, id: { not: beneficiaryId } },
            },
          })
        : Promise.resolve(0),
    ]);

    if (nniCount > 0 && nni) {
      await this.anomalyDetection.detectDuplicateNni(beneficiaryId, nni);
    }
    if (phoneCount > 0 && phone) {
      await this.anomalyDetection.detectDuplicatePhone(beneficiaryId, phone);
    }

    return { nni: nniCount > 0, phone: phoneCount > 0 };
  }

  private async getAnomaliesSummary(
    beneficiaryId: string,
  ): Promise<AnomaliesSummary> {
    const [open, total] = await Promise.all([
      this.prisma.anomaly.count({
        where: { beneficiaryId, status: 'OPEN' },
      }),
      this.prisma.anomaly.count({ where: { beneficiaryId } }),
    ]);
    return { open, total };
  }

  private async getPaymentSummary(
    beneficiaryId: string,
  ): Promise<PaymentSummary> {
    const [total, paid, pending, lastPaid] = await Promise.all([
      this.prisma.payment.count({ where: { beneficiaryId } }),
      this.prisma.payment.count({
        where: { beneficiaryId, status: PaymentStatus.PAID },
      }),
      this.prisma.payment.count({
        where: { beneficiaryId, status: PaymentStatus.PENDING },
      }),
      this.prisma.payment.findFirst({
        where: { beneficiaryId, status: PaymentStatus.PAID },
        orderBy: { paidAt: 'desc' },
        select: { paidAt: true },
      }),
    ]);

    return { total, paid, pending, lastPaidAt: lastPaid?.paidAt ?? null };
  }

  private snapshot(
    beneficiary: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    const snap: Record<string, unknown> = {};
    for (const field of TRACKED_FIELDS) {
      snap[field] = this.normalizeValue(beneficiary[field]);
    }
    return snap as Prisma.InputJsonValue;
  }

  private diff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): {
    oldValues: Record<string, unknown> | null;
    newValues: Record<string, unknown> | null;
  } {
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    let changed = false;

    for (const field of TRACKED_FIELDS) {
      const beforeVal = this.normalizeValue(before[field]);
      const afterVal = this.normalizeValue(after[field]);
      if (beforeVal !== afterVal) {
        oldValues[field] = beforeVal;
        newValues[field] = afterVal;
        changed = true;
      }
    }

    if (!changed) {
      return { oldValues: null, newValues: null };
    }
    return { oldValues, newValues };
  }

  private normalizeValue(value: unknown): unknown {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value ?? null;
  }
}
