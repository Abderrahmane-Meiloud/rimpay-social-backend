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
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import {
  buildPaginatedResponse,
  PaginatedResponseDto,
} from '../common/dto/paginated-response.dto';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { BeneficiaryQueryDto } from './dto/beneficiary-query.dto';
import {
  ImportBeneficiariesDto,
  ImportBeneficiaryRowDto,
} from './dto/import-beneficiaries.dto';
import {
  BeneficiaryDetailDto,
  BeneficiaryListItemDto,
  BeneficiaryMutationResponseDto,
  DuplicateWarningDto,
  ImportBeneficiariesResponseDto,
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

// Internal-only signal used to route a rejected import row to the
// "skipped" bucket instead of "invalid" — never thrown across the service
// boundary, always caught within importMany.
class ImportDuplicateError extends Error {}

@Injectable()
export class BeneficiariesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anomalyDetection: AnomalyDetectionService,
  ) {}

  async findAll(
    query: BeneficiaryQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<BeneficiaryListItemDto>> {
    const where = await this.buildWhere(query, currentUser);
    const canViewSensitive = this.canViewSensitive(currentUser);

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
      rows.map((row) => toBeneficiaryListItem(row, canViewSensitive)),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<BeneficiaryDetailDto> {
    await this.assertBeneficiaryInScope(id, currentUser);

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

    return toBeneficiaryDetail(
      row,
      anomaliesSummary,
      paymentSummary,
      this.canViewSensitive(currentUser),
    );
  }

  async create(
    dto: CreateBeneficiaryDto,
    currentUser: AuthenticatedUser,
  ): Promise<BeneficiaryMutationResponseDto> {
    const currentUserId = currentUser.id;
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

    const detail = await this.findOne(created.id, currentUser);
    return { ...detail, duplicateWarnings };
  }

  // Bulk import (ADMIN_TAAZOUR only — enforced via beneficiaries.import
  // permission at the controller level). Each row is validated and inserted
  // independently: one bad or duplicate row never aborts the whole batch.
  // The response never echoes back raw NNI or other row payloads, only
  // aggregate counts and a reason string per rejected row.
  async importMany(
    dto: ImportBeneficiariesDto,
    currentUser: AuthenticatedUser,
  ): Promise<ImportBeneficiariesResponseDto> {
    const currentUserId = currentUser.id;
    const result: ImportBeneficiariesResponseDto = {
      created: 0,
      skipped: 0,
      invalid: 0,
      errors: [],
    };

    const seenRegistryCodes = new Set<string>();
    const seenNnis = new Set<string>();

    for (let i = 0; i < dto.beneficiaries.length; i++) {
      const row = dto.beneficiaries[i];
      const index = i + 1;

      try {
        await this.importRow(row, currentUserId, seenRegistryCodes, seenNnis);
        result.created++;
      } catch (err) {
        if (err instanceof ImportDuplicateError) {
          result.skipped++;
          result.errors.push({ index, reason: err.message });
        } else if (err instanceof BadRequestException) {
          result.invalid++;
          result.errors.push({ index, reason: err.message });
        } else {
          throw err;
        }
      }
    }

    return result;
  }

  private async importRow(
    row: ImportBeneficiaryRowDto,
    currentUserId: string,
    seenRegistryCodes: Set<string>,
    seenNnis: Set<string>,
  ): Promise<void> {
    if (!row.fullName || !row.fullName.trim()) {
      throw new BadRequestException('fullName is required');
    }
    if (!row.localityId) {
      throw new BadRequestException('localityId is required');
    }

    const locality = await this.prisma.locality.findUnique({
      where: { id: row.localityId },
      select: { id: true },
    });
    if (!locality) {
      throw new BadRequestException('Invalid localityId');
    }

    if (row.registryCode && seenRegistryCodes.has(row.registryCode)) {
      throw new ImportDuplicateError('duplicate registryCode within import batch');
    }
    if (row.nni && seenNnis.has(row.nni)) {
      throw new ImportDuplicateError('duplicate nni within import batch');
    }

    const registryCode = await this.resolveImportRegistryCode(row.registryCode);

    if (row.nni) {
      const existingByNni = await this.prisma.beneficiary.findFirst({
        where: { nni: row.nni, deletedAt: null },
        select: { id: true },
      });
      if (existingByNni) {
        throw new ImportDuplicateError('nni already exists');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const beneficiary = await tx.beneficiary.create({
        data: {
          registryCode,
          fullName: row.fullName,
          nni: row.nni,
          localityId: row.localityId,
          status: BeneficiaryStatus.ACTIVE,
          birthDate: row.birthDate ? new Date(row.birthDate) : undefined,
          source: 'import',
          contacts: row.phone
            ? {
                create: {
                  type: ContactType.PRIMARY,
                  phone: row.phone,
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
          reason: 'imported',
        },
      });
    });

    if (row.registryCode) seenRegistryCodes.add(row.registryCode);
    if (row.nni) seenNnis.add(row.nni);
  }

  private async resolveImportRegistryCode(provided?: string): Promise<string> {
    if (provided) {
      const existing = await this.prisma.beneficiary.findUnique({
        where: { registryCode: provided },
        select: { id: true },
      });
      if (existing) {
        throw new ImportDuplicateError('registryCode already exists');
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

  async update(
    id: string,
    dto: UpdateBeneficiaryDto,
    currentUser: AuthenticatedUser,
  ): Promise<BeneficiaryMutationResponseDto> {
    const currentUserId = currentUser.id;
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

    const detail = await this.findOne(id, currentUser);
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

  private async buildWhere(
    query: BeneficiaryQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<Prisma.BeneficiaryWhereInput> {
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

    const scopeFilter = this.buildScopeFilter(currentUser);
    if (scopeFilter) and.push(scopeFilter);

    if (and.length > 0) where.AND = and;
    return where;
  }

  // Institutional scoping (INSTITUTIONAL-RBAC-2):
  // - ADMIN_TAAZOUR: unrestricted (no filter).
  // - PROGRAMME: only beneficiaries assigned to a payment operation of one
  //   of the caller's scoped programmes.
  // - OPERATOR: only beneficiaries assigned to a payment operation of the
  //   caller's operator (cannot browse the full citizen registry).
  // A PROGRAMME/OPERATOR user with no scope configured sees zero rows,
  // never an unrestricted registry.
  private buildScopeFilter(
    currentUser: AuthenticatedUser,
  ): Prisma.BeneficiaryWhereInput | null {
    if (currentUser.roles.includes('ADMIN_TAAZOUR')) {
      return null;
    }

    if (currentUser.roles.includes('PROGRAMME')) {
      return {
        paymentOperationBeneficiaries: {
          some: {
            paymentOperation: {
              socialProgramId: { in: currentUser.programmeIds },
            },
          },
        },
      };
    }

    if (currentUser.roles.includes('OPERATOR')) {
      if (!currentUser.operatorId) {
        return { id: { in: [] } };
      }
      return {
        paymentOperationBeneficiaries: {
          some: {
            paymentOperation: { operatorId: currentUser.operatorId },
          },
        },
      };
    }

    // Any other caller (e.g. AGENT) sees nothing through this endpoint by
    // default — field agents consume beneficiaries via the payments/field
    // flow, not this registry-wide listing.
    return { id: { in: [] } };
  }

  private canViewSensitive(currentUser: AuthenticatedUser): boolean {
    return currentUser.permissions.includes('beneficiaries.read_sensitive');
  }

  private async assertBeneficiaryInScope(
    beneficiaryId: string,
    currentUser: AuthenticatedUser,
  ): Promise<void> {
    const scopeFilter = this.buildScopeFilter(currentUser);
    if (!scopeFilter) return;

    const match = await this.prisma.beneficiary.findFirst({
      where: { id: beneficiaryId, deletedAt: null, AND: [scopeFilter] },
      select: { id: true },
    });
    if (!match) {
      throw new NotFoundException('Beneficiary not found');
    }
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
