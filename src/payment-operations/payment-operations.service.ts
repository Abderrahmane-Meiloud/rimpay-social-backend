import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgentStatus,
  AuditSource,
  InclusionStatus,
  OperationAgentStatus,
  OperationStatus,
  PaymentStatus,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OperatorsService } from '../operators/operators.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import {
  buildPaginatedResponse,
  PaginatedResponseDto,
} from '../common/dto/paginated-response.dto';
import { CreatePaymentOperationDto } from './dto/create-payment-operation.dto';
import { UpdatePaymentOperationDto } from './dto/update-payment-operation.dto';
import { PaymentOperationQueryDto } from './dto/payment-operation-query.dto';
import { AssignBeneficiariesDto } from './dto/assign-beneficiaries.dto';
import {
  AssignOperationAgentsDto,
  OperationAgentAssignmentResponseDto,
  OperationAgentResultItemDto,
} from './dto/assign-operation-agents.dto';
import {
  AssignmentResponseDto,
  AssignmentResultItemDto,
  BeneficiaryAssignmentSummaryDto,
  OperationDetailDto,
  OperationListItemDto,
  PaymentSummaryDto,
} from './dto/payment-operation-response.dto';
import {
  operationListInclude,
  toOperationDetail,
  toOperationListItem,
} from './payment-operations.mapper';
import {
  ALLOWED_TRANSITIONS,
  canAssign,
  canClose,
  canEdit,
  canOpen,
} from './operation-status';

type GeoScope = {
  regionId?: string;
  moughataaId?: string;
  communeId?: string;
  localityId?: string;
};

@Injectable()
export class PaymentOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operatorsService: OperatorsService,
  ) {}

  async findAll(
    query: PaymentOperationQueryDto,
    currentUser?: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<OperationListItemDto>> {
    const where = this.buildWhere(query, currentUser);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.paymentOperation.findMany({
        where,
        include: operationListInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.paymentOperation.count({ where }),
    ]);

    return buildPaginatedResponse(
      rows.map(toOperationListItem),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(
    id: string,
    currentUser?: AuthenticatedUser,
  ): Promise<OperationDetailDto> {
    const scopeFilter = currentUser
      ? this.buildScopeFilter(currentUser)
      : null;
    const row = await this.prisma.paymentOperation.findFirst({
      where: scopeFilter
        ? { id, deletedAt: null, AND: [scopeFilter] }
        : { id, deletedAt: null },
      include: operationListInclude,
    });
    if (!row) {
      throw new NotFoundException('Operation not found');
    }

    const [assignmentSummary, paymentSummary] = await Promise.all([
      this.getAssignmentSummary(id),
      this.getPaymentSummary(id),
    ]);

    return toOperationDetail(row, assignmentSummary, paymentSummary);
  }

  async create(
    dto: CreatePaymentOperationDto,
    currentUserId: string,
  ): Promise<OperationDetailDto> {
    await this.assertProgramExists(dto.socialProgramId);
    await this.assertCodeIsFree(dto.code);
    this.validateDateRange(dto.startDate, dto.endDate);
    const scope = this.validateScope(dto);
    await this.assertScopeExists(scope);
    if (dto.operatorId) {
      await this.operatorsService.assertOperatorIsActive(dto.operatorId);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const operation = await tx.paymentOperation.create({
        data: {
          socialProgramId: dto.socialProgramId,
          operatorId: dto.operatorId ?? undefined,
          name: dto.name,
          code: dto.code,
          period: dto.period,
          regionId: scope.regionId,
          moughataaId: scope.moughataaId,
          communeId: scope.communeId,
          localityId: scope.localityId,
          plannedAmount: dto.plannedAmount ?? undefined,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          // status defaults to DRAFT; client cannot set it.
        },
      });

      await this.writeAudit(tx, currentUserId, 'operation.create', operation.id, {
        oldValues: Prisma.DbNull,
        newValues: this.operationAuditSnapshot(operation),
      });

      return operation;
    });

    return this.findOne(created.id);
  }

  async update(
    id: string,
    dto: UpdatePaymentOperationDto,
    currentUserId: string,
  ): Promise<OperationDetailDto> {
    const existing = await this.prisma.paymentOperation.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Operation not found');
    }

    if (!canEdit(existing.status)) {
      throw new ConflictException(
        'Operation is not editable in its current status',
      );
    }

    this.validateDateRange(dto.startDate, dto.endDate);

    if (dto.operatorId !== undefined && dto.operatorId !== existing.operatorId) {
      await this.operatorsService.assertOperatorIsActive(dto.operatorId);
    }

    const data: Prisma.PaymentOperationUpdateInput = {};
    if (dto.operatorId !== undefined) {
      data.operator = { connect: { id: dto.operatorId } };
    }
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.period !== undefined) data.period = dto.period;
    if (dto.plannedAmount !== undefined) data.plannedAmount = dto.plannedAmount;
    if (dto.startDate !== undefined)
      data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined)
      data.endDate = dto.endDate ? new Date(dto.endDate) : null;

    // Geography scope: only re-apply when any scope field is present in the
    // request, and re-validate the one-scope rule against the new values.
    const scopeProvided =
      dto.regionId !== undefined ||
      dto.moughataaId !== undefined ||
      dto.communeId !== undefined ||
      dto.localityId !== undefined;

    if (scopeProvided) {
      const scope = this.validateScope(dto);
      await this.assertScopeExists(scope);
      data.region = scope.regionId
        ? { connect: { id: scope.regionId } }
        : { disconnect: true };
      data.moughataa = scope.moughataaId
        ? { connect: { id: scope.moughataaId } }
        : { disconnect: true };
      data.commune = scope.communeId
        ? { connect: { id: scope.communeId } }
        : { disconnect: true };
      data.locality = scope.localityId
        ? { connect: { id: scope.localityId } }
        : { disconnect: true };
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.paymentOperation.update({ where: { id }, data });
      await this.writeAudit(tx, currentUserId, 'operation.update', id, {
        oldValues: this.operationAuditSnapshot(existing),
        newValues: this.operationAuditSnapshot(updated),
      });
    });

    return this.findOne(id);
  }

  async open(id: string, currentUserId: string): Promise<OperationDetailDto> {
    const existing = await this.prisma.paymentOperation.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Operation not found');
    }

    if (!canOpen(existing.status)) {
      throw new ConflictException(
        `Operation cannot be opened from status ${existing.status}`,
      );
    }

    const includedCount = await this.prisma.paymentOperationBeneficiary.count({
      where: { paymentOperationId: id, status: InclusionStatus.INCLUDED },
    });
    if (includedCount === 0) {
      throw new ConflictException(
        'Operation requires at least one assigned beneficiary before opening',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentOperation.update({
        where: { id },
        data: { status: OperationStatus.OPEN },
      });
      await this.writeAudit(tx, currentUserId, 'operation.open', id, {
        oldValues: { status: existing.status },
        newValues: { status: OperationStatus.OPEN },
      });
    });

    return this.findOne(id);
  }

  async close(id: string, currentUserId: string): Promise<OperationDetailDto> {
    const existing = await this.prisma.paymentOperation.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Operation not found');
    }

    if (!canClose(existing.status)) {
      throw new ConflictException(
        `Operation cannot be closed from status ${existing.status}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentOperation.update({
        where: { id },
        data: { status: OperationStatus.CLOSED },
      });
      await this.writeAudit(tx, currentUserId, 'operation.close', id, {
        oldValues: { status: existing.status },
        newValues: { status: OperationStatus.CLOSED },
      });
    });

    return this.findOne(id);
  }

  async transition(
    id: string,
    targetStatus: OperationStatus,
    currentUserId: string,
  ): Promise<OperationDetailDto> {
    if (
      targetStatus === OperationStatus.OPEN ||
      targetStatus === OperationStatus.CLOSED
    ) {
      throw new BadRequestException(
        `Use the dedicated /${targetStatus === OperationStatus.OPEN ? 'open' : 'close'} endpoint for this transition`,
      );
    }

    const existing = await this.prisma.paymentOperation.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Operation not found');
    }

    const allowed = ALLOWED_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new ConflictException(
        `Transition ${existing.status} → ${targetStatus} is not allowed`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentOperation.update({
        where: { id },
        data: { status: targetStatus },
      });
      await this.writeAudit(
        tx,
        currentUserId,
        'operation.status_transition',
        id,
        {
          oldValues: { status: existing.status },
          newValues: { status: targetStatus },
        },
      );
    });

    return this.findOne(id);
  }

  async assignBeneficiaries(
    id: string,
    dto: AssignBeneficiariesDto,
    currentUserId: string,
  ): Promise<AssignmentResponseDto> {
    const operation = await this.prisma.paymentOperation.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!operation) {
      throw new NotFoundException('Operation not found');
    }
    if (!canAssign(operation.status)) {
      throw new ConflictException(
        `Beneficiaries cannot be assigned while operation is ${operation.status}`,
      );
    }

    const beneficiaryIds = dto.beneficiaries.map((b) => b.beneficiaryId);

    // Validate all beneficiaries exist and are not soft-deleted (all-or-nothing).
    const existing = await this.prisma.beneficiary.findMany({
      where: { id: { in: beneficiaryIds }, deletedAt: null },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((b) => b.id));
    const invalid = beneficiaryIds.filter((bid) => !existingIds.has(bid));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Invalid or soft-deleted beneficiary id(s): ${invalid.join(', ')}`,
      );
    }

    const items: AssignmentResultItemDto[] = [];
    let assigned = 0;
    let skippedDuplicates = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.beneficiaries) {
        const current = await tx.paymentOperationBeneficiary.findUnique({
          where: {
            paymentOperationId_beneficiaryId: {
              paymentOperationId: id,
              beneficiaryId: item.beneficiaryId,
            },
          },
          select: { id: true, status: true, plannedAmount: true },
        });

        if (current) {
          // Already assigned: do not duplicate, do not error. Reported as such.
          skippedDuplicates++;
          items.push({
            beneficiaryId: item.beneficiaryId,
            status: current.status,
            plannedAmount: current.plannedAmount
              ? current.plannedAmount.toString()
              : null,
            alreadyAssigned: true,
          });
          continue;
        }

        const createdRow = await tx.paymentOperationBeneficiary.create({
          data: {
            paymentOperationId: id,
            beneficiaryId: item.beneficiaryId,
            plannedAmount: item.plannedAmount ?? undefined,
            status: InclusionStatus.INCLUDED,
          },
          select: { status: true, plannedAmount: true },
        });
        assigned++;
        items.push({
          beneficiaryId: item.beneficiaryId,
          status: createdRow.status,
          plannedAmount: createdRow.plannedAmount
            ? createdRow.plannedAmount.toString()
            : null,
          alreadyAssigned: false,
        });
      }

      await this.writeAudit(
        tx,
        currentUserId,
        'operation.assign_beneficiaries',
        id,
        {
          oldValues: Prisma.DbNull,
          newValues: {
            requested: beneficiaryIds.length,
            assigned,
            skippedDuplicates,
          },
        },
      );
    });

    return { assigned, skippedDuplicates, items };
  }

  async listAssignedBeneficiaries(
    operationId: string,
    query: { page: number; limit: number; status?: InclusionStatus },
  ) {
    const operation = await this.prisma.paymentOperation.findFirst({
      where: { id: operationId, deletedAt: null },
      select: { id: true },
    });
    if (!operation) {
      throw new NotFoundException('Operation not found');
    }

    const where: Prisma.PaymentOperationBeneficiaryWhereInput = {
      paymentOperationId: operationId,
    };
    if (query.status) {
      where.status = query.status;
    }

    const beneficiaryInclude = {
      beneficiary: {
        select: {
          id: true,
          registryCode: true,
          fullName: true,
          nni: true,
          status: true,
          locality: {
            select: {
              id: true,
              name: true,
              commune: {
                select: {
                  moughataa: {
                    select: {
                      region: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    } as const;

    const rows = await this.prisma.paymentOperationBeneficiary.findMany({
      where,
      include: beneficiaryInclude,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    const total = await this.prisma.paymentOperationBeneficiary.count({ where });

    const beneficiaryIds = rows.map((r) => r.beneficiaryId);
    const payments = beneficiaryIds.length > 0
      ? await this.prisma.payment.findMany({
          where: {
            paymentOperationId: operationId,
            beneficiaryId: { in: beneficiaryIds },
          },
          select: { beneficiaryId: true, status: true },
        })
      : [];
    const paymentByBen = new Map(payments.map((p) => [p.beneficiaryId, p.status]));

    const data = rows.map((row) => {
      const paymentStatus = paymentByBen.get(row.beneficiaryId) ?? null;
      const paymentExists = paymentStatus !== null;
      const exclusionAllowed =
        !paymentExists || paymentStatus === PaymentStatus.CANCELLED;
      const exclusionBlockReason = paymentExists && !exclusionAllowed
        ? `Paiement ${paymentStatus}`
        : null;

      return {
        id: row.id,
        beneficiaryId: row.beneficiaryId,
        registryCode: row.beneficiary.registryCode,
        fullName: row.beneficiary.fullName,
        nni: row.beneficiary.nni,
        locality: row.beneficiary.locality?.name ?? null,
        region:
          row.beneficiary.locality?.commune?.moughataa?.region?.name ?? null,
        beneficiaryStatus: row.beneficiary.status,
        inclusionStatus: row.status,
        plannedAmount: row.plannedAmount ? row.plannedAmount.toString() : null,
        assignedAt: row.createdAt,
        paymentExists,
        paymentStatus,
        exclusionAllowed,
        exclusionBlockReason,
      };
    });

    return buildPaginatedResponse(data, total, query.page, query.limit);
  }

  async excludeBeneficiary(
    id: string,
    beneficiaryId: string,
    currentUserId: string,
  ): Promise<{ message: string }> {
    return this.prisma.$transaction(async (tx) => {
      const operation = await tx.paymentOperation.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, status: true },
      });
      if (!operation) {
        throw new NotFoundException('Operation not found');
      }
      if (!canAssign(operation.status)) {
        throw new ConflictException(
          `Beneficiaries cannot be excluded while operation is ${operation.status}`,
        );
      }

      const assignment = await tx.paymentOperationBeneficiary.findUnique({
        where: {
          paymentOperationId_beneficiaryId: {
            paymentOperationId: id,
            beneficiaryId,
          },
        },
        select: { id: true, status: true },
      });
      if (!assignment) {
        throw new NotFoundException(
          'Beneficiary is not assigned to this operation',
        );
      }
      if (assignment.status !== InclusionStatus.INCLUDED) {
        throw new ConflictException(
          `Le bénéficiaire ne peut être exclu que depuis le statut INCLUDED (actuel : ${assignment.status})`,
        );
      }

      const payment = await tx.payment.findFirst({
        where: { paymentOperationId: id, beneficiaryId },
        select: { status: true },
      });
      if (payment && payment.status !== PaymentStatus.CANCELLED) {
        throw new ConflictException(
          `Exclusion impossible — un paiement existe avec le statut ${payment.status}`,
        );
      }

      const { count } = await tx.paymentOperationBeneficiary.updateMany({
        where: {
          paymentOperationId: id,
          beneficiaryId,
          status: InclusionStatus.INCLUDED,
        },
        data: { status: InclusionStatus.EXCLUDED },
      });

      if (count === 0) {
        throw new ConflictException(
          "Le bénéficiaire n'est plus inclus dans cette opération.",
        );
      }

      await this.writeAudit(
        tx,
        currentUserId,
        'operation.exclude_beneficiary',
        id,
        {
          oldValues: { beneficiaryId, status: InclusionStatus.INCLUDED },
          newValues: { beneficiaryId, status: InclusionStatus.EXCLUDED },
        },
      );

      return { message: 'Beneficiary excluded from operation' };
    });
  }

  async reincludeBeneficiary(
    id: string,
    beneficiaryId: string,
    currentUserId: string,
  ): Promise<{
    message: string;
    beneficiaryId: string;
    previousStatus: string;
    newStatus: string;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const operation = await tx.paymentOperation.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, status: true },
      });
      if (!operation) {
        throw new NotFoundException('Operation not found');
      }
      if (!canAssign(operation.status)) {
        throw new ConflictException(
          `La ré-inclusion n'est pas autorisée quand l'opération est ${operation.status}`,
        );
      }

      const assignment = await tx.paymentOperationBeneficiary.findUnique({
        where: {
          paymentOperationId_beneficiaryId: {
            paymentOperationId: id,
            beneficiaryId,
          },
        },
        select: { id: true, status: true },
      });
      if (!assignment) {
        throw new NotFoundException(
          'Beneficiary is not assigned to this operation',
        );
      }
      if (assignment.status === InclusionStatus.INCLUDED) {
        throw new ConflictException('Le bénéficiaire est déjà inclus');
      }
      if (assignment.status !== InclusionStatus.EXCLUDED) {
        throw new ConflictException(
          `La ré-inclusion n'est possible que depuis le statut EXCLUDED (actuel : ${assignment.status})`,
        );
      }

      const beneficiary = await tx.beneficiary.findFirst({
        where: { id: beneficiaryId, deletedAt: null },
        select: { id: true },
      });
      if (!beneficiary) {
        throw new BadRequestException(
          'Le bénéficiaire a été supprimé et ne peut pas être ré-inclus',
        );
      }

      const { count } = await tx.paymentOperationBeneficiary.updateMany({
        where: {
          paymentOperationId: id,
          beneficiaryId,
          status: InclusionStatus.EXCLUDED,
        },
        data: { status: InclusionStatus.INCLUDED },
      });

      if (count === 0) {
        throw new ConflictException(
          "Le bénéficiaire n'est plus exclu de cette opération.",
        );
      }

      await this.writeAudit(
        tx,
        currentUserId,
        'operation.reinclude_beneficiary',
        id,
        {
          oldValues: { beneficiaryId, status: InclusionStatus.EXCLUDED },
          newValues: { beneficiaryId, status: InclusionStatus.INCLUDED },
        },
      );

      return {
        message: 'Beneficiary re-included in operation',
        beneficiaryId,
        previousStatus: InclusionStatus.EXCLUDED,
        newStatus: InclusionStatus.INCLUDED,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildWhere(
    query: PaymentOperationQueryDto,
    currentUser?: AuthenticatedUser,
  ): Prisma.PaymentOperationWhereInput {
    const where: Prisma.PaymentOperationWhereInput = { deletedAt: null };
    const and: Prisma.PaymentOperationWhereInput[] = [];

    if (query.search) {
      and.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { code: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    if (query.code) and.push({ code: query.code });
    if (query.status) and.push({ status: query.status });
    if (query.socialProgramId)
      and.push({ socialProgramId: query.socialProgramId });
    if (query.regionId) and.push({ regionId: query.regionId });
    if (query.moughataaId) and.push({ moughataaId: query.moughataaId });
    if (query.communeId) and.push({ communeId: query.communeId });
    if (query.localityId) and.push({ localityId: query.localityId });

    if (query.startDate || query.endDate) {
      const startDate: Prisma.DateTimeFilter = {};
      if (query.startDate) startDate.gte = new Date(query.startDate);
      if (query.endDate) startDate.lte = new Date(query.endDate);
      and.push({ startDate });
    }

    if (currentUser) {
      const scopeFilter = this.buildScopeFilter(currentUser);
      if (scopeFilter) and.push(scopeFilter);
    }

    if (and.length > 0) where.AND = and;
    return where;
  }

  // Institutional scoping (INSTITUTIONAL-RBAC-2), read paths only
  // (findAll/findOne). Write/lifecycle methods on this service are
  // permission-gated to ADMIN_TAAZOUR/PROGRAMME roles and are out of scope
  // for this phase's row-level enforcement.
  private buildScopeFilter(
    currentUser: AuthenticatedUser,
  ): Prisma.PaymentOperationWhereInput | null {
    if (currentUser.roles.includes('ADMIN_TAAZOUR')) {
      return null;
    }
    if (currentUser.roles.includes('PROGRAMME')) {
      return { socialProgramId: { in: currentUser.programmeIds } };
    }
    if (currentUser.roles.includes('OPERATOR')) {
      if (!currentUser.operatorId) return { id: '' };
      return { operatorId: currentUser.operatorId };
    }
    return { id: '' };
  }

  private validateDateRange(
    startDate?: string,
    endDate?: string,
  ): void {
    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      throw new BadRequestException(
        'startDate must be before endDate',
      );
    }
  }

  private validateScope(scope: GeoScope): GeoScope {
    const provided = [
      scope.regionId,
      scope.moughataaId,
      scope.communeId,
      scope.localityId,
    ].filter((v) => v !== undefined && v !== null);

    if (provided.length > 1) {
      throw new BadRequestException(
        'Invalid geographic scope: provide at most one of regionId/moughataaId/communeId/localityId',
      );
    }

    return {
      regionId: scope.regionId,
      moughataaId: scope.moughataaId,
      communeId: scope.communeId,
      localityId: scope.localityId,
    };
  }

  private async assertScopeExists(scope: GeoScope): Promise<void> {
    if (scope.regionId) {
      const r = await this.prisma.region.findUnique({
        where: { id: scope.regionId },
        select: { id: true },
      });
      if (!r) throw new BadRequestException('Invalid regionId');
    }
    if (scope.moughataaId) {
      const m = await this.prisma.moughataa.findUnique({
        where: { id: scope.moughataaId },
        select: { id: true },
      });
      if (!m) throw new BadRequestException('Invalid moughataaId');
    }
    if (scope.communeId) {
      const c = await this.prisma.commune.findUnique({
        where: { id: scope.communeId },
        select: { id: true },
      });
      if (!c) throw new BadRequestException('Invalid communeId');
    }
    if (scope.localityId) {
      const l = await this.prisma.locality.findUnique({
        where: { id: scope.localityId },
        select: { id: true },
      });
      if (!l) throw new BadRequestException('Invalid localityId');
    }
  }

  private async assertProgramExists(socialProgramId: string): Promise<void> {
    const program = await this.prisma.socialProgram.findFirst({
      where: { id: socialProgramId, deletedAt: null },
      select: { id: true },
    });
    if (!program) {
      throw new BadRequestException('Invalid socialProgramId');
    }
  }

  private async assertCodeIsFree(code: string): Promise<void> {
    const existing = await this.prisma.paymentOperation.findUnique({
      where: { code },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('code already exists');
    }
  }

  private async getAssignmentSummary(
    operationId: string,
  ): Promise<BeneficiaryAssignmentSummaryDto> {
    const grouped = await this.prisma.paymentOperationBeneficiary.groupBy({
      by: ['status'],
      where: { paymentOperationId: operationId },
      _count: { _all: true },
    });

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const g of grouped) {
      byStatus[g.status] = g._count._all;
      total += g._count._all;
    }
    return { total, byStatus };
  }

  private async getPaymentSummary(
    operationId: string,
  ): Promise<PaymentSummaryDto> {
    const [total, paid, pending, lastPaid] = await Promise.all([
      this.prisma.payment.count({ where: { paymentOperationId: operationId } }),
      this.prisma.payment.count({
        where: { paymentOperationId: operationId, status: PaymentStatus.PAID },
      }),
      this.prisma.payment.count({
        where: {
          paymentOperationId: operationId,
          status: PaymentStatus.PENDING,
        },
      }),
      this.prisma.payment.findFirst({
        where: { paymentOperationId: operationId, status: PaymentStatus.PAID },
        orderBy: { paidAt: 'desc' },
        select: { paidAt: true },
      }),
    ]);

    return { total, paid, pending, lastPaidAt: lastPaid?.paidAt ?? null };
  }

  private operationAuditSnapshot(
    operation: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    return {
      name: operation.name as string,
      code: operation.code as string,
      socialProgramId: operation.socialProgramId as string,
      operatorId: (operation.operatorId as string | null) ?? null,
      status: operation.status as string,
      period: (operation.period as string | null) ?? null,
      regionId: (operation.regionId as string | null) ?? null,
      moughataaId: (operation.moughataaId as string | null) ?? null,
      communeId: (operation.communeId as string | null) ?? null,
      localityId: (operation.localityId as string | null) ?? null,
      plannedAmount: operation.plannedAmount
        ? String(operation.plannedAmount)
        : null,
    };
  }

  async assignAgents(
    id: string,
    dto: AssignOperationAgentsDto,
    currentUserId: string,
  ): Promise<OperationAgentAssignmentResponseDto> {
    const operation = await this.prisma.paymentOperation.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!operation) throw new NotFoundException('Operation not found');

    if (!canAssign(operation.status)) {
      throw new ConflictException(
        `Agents cannot be assigned while operation is ${operation.status}`,
      );
    }

    const agentIds = dto.agents.map((a) => a.agentId);

    // Validate all agents exist, not soft-deleted, and are ACTIVE.
    const validAgents = await this.prisma.agent.findMany({
      where: { id: { in: agentIds }, deletedAt: null, status: AgentStatus.ACTIVE },
      select: { id: true },
    });
    const validIds = new Set(validAgents.map((a) => a.id));
    const invalid = agentIds.filter((aid) => !validIds.has(aid));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Invalid, soft-deleted, or non-ACTIVE agent id(s): ${invalid.join(', ')}`,
      );
    }

    const items: OperationAgentResultItemDto[] = [];
    let assigned = 0;
    let skippedDuplicates = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.agents) {
        const current = await tx.operationAgent.findUnique({
          where: {
            paymentOperationId_agentId: {
              paymentOperationId: id,
              agentId: item.agentId,
            },
          },
          select: { id: true, status: true, assignedArea: true },
        });

        if (current) {
          skippedDuplicates++;
          items.push({
            agentId: item.agentId,
            status: current.status,
            assignedArea: current.assignedArea,
            alreadyAssigned: true,
          });
          continue;
        }

        const created = await tx.operationAgent.create({
          data: {
            paymentOperationId: id,
            agentId: item.agentId,
            assignedArea: item.assignedArea ?? undefined,
            status: OperationAgentStatus.ACTIVE,
          },
          select: { status: true, assignedArea: true },
        });
        assigned++;
        items.push({
          agentId: item.agentId,
          status: created.status,
          assignedArea: created.assignedArea,
          alreadyAssigned: false,
        });
      }

      await this.writeAudit(tx, currentUserId, 'operation.assign_agents', id, {
        oldValues: Prisma.DbNull,
        newValues: { requested: agentIds.length, assigned, skippedDuplicates },
      });
    });

    return { assigned, skippedDuplicates, items };
  }

  async removeAgent(
    id: string,
    agentId: string,
    currentUserId: string,
  ): Promise<{ message: string }> {
    const operation = await this.prisma.paymentOperation.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!operation) throw new NotFoundException('Operation not found');

    const assignment = await this.prisma.operationAgent.findUnique({
      where: {
        paymentOperationId_agentId: { paymentOperationId: id, agentId },
      },
      select: { id: true, status: true },
    });
    if (!assignment) {
      throw new NotFoundException('Agent assignment not found for this operation');
    }
    if (assignment.status === OperationAgentStatus.REMOVED) {
      throw new ConflictException('Agent assignment is already REMOVED');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.operationAgent.update({
        where: { id: assignment.id },
        data: { status: OperationAgentStatus.REMOVED },
      });

      await this.writeAudit(tx, currentUserId, 'operation.remove_agent', id, {
        oldValues: { agentId, status: assignment.status },
        newValues: { agentId, status: OperationAgentStatus.REMOVED },
      });
    });

    return { message: 'Agent removed from operation' };
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    userId: string,
    action: string,
    entityId: string,
    values: {
      oldValues: Prisma.InputJsonValue | typeof Prisma.DbNull;
      newValues: Prisma.InputJsonValue | typeof Prisma.DbNull;
    },
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        userId,
        action,
        entityType: 'PaymentOperation',
        entityId,
        oldValues: values.oldValues,
        newValues: values.newValues,
        source: AuditSource.WEB,
      },
    });
  }
}
