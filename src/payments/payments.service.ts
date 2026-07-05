import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  AgentStatus,
  AuditSource,
  DeviceStatus,
  InclusionStatus,
  OperationAgentStatus,
  Prisma,
  PaymentStatus,
  ValidationOutcome,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnomalyDetectionService } from '../anomalies/anomaly-detection.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import {
  buildPaginatedResponse,
  PaginatedResponseDto,
} from '../common/dto/paginated-response.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { CancelPaymentDto } from './dto/cancel-payment.dto';
import {
  PaymentDetailDto,
  PaymentListItemDto,
  PaymentValidationSummaryDto,
  PaymentAnomalySummaryDto,
} from './dto/payment-response.dto';
import { GeneratePaymentsResponseDto } from './dto/generate-payments-response.dto';
import { ValidatePaymentDto } from './dto/validate-payment.dto';
import { ValidationResponseDto } from './dto/validation-response.dto';
import {
  paymentDetailInclude,
  paymentListInclude,
  toPaymentDetail,
  toPaymentListItem,
} from './payments.mapper';
import {
  CANCELLABLE_PAYMENT_STATUSES,
  canCancelPayment,
  canGeneratePayments,
  canValidateOnOperation,
  canValidatePayment,
} from './payment-status';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anomalyDetection: AnomalyDetectionService,
  ) {}

  async findAll(
    query: PaymentQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<PaymentListItemDto>> {
    const where = this.buildWhere(query, currentUser);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: paymentListInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return buildPaginatedResponse(
      rows.map(toPaymentListItem),
      total,
      query.page,
      query.limit,
    );
  }

  async findAllForOperation(
    operationId: string,
    query: PaymentQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<PaymentListItemDto>> {
    const operation = await this.prisma.paymentOperation.findFirst({
      where: { id: operationId, deletedAt: null },
      select: { id: true },
    });
    if (!operation) {
      throw new NotFoundException('Operation not found');
    }

    // Force the operation id from the path, ignoring any conflicting query value.
    return this.findAll(
      { ...query, paymentOperationId: operationId },
      currentUser,
    );
  }

  async findOne(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<PaymentDetailDto> {
    const scopeFilter = this.buildScopeFilter(currentUser);
    const row = await this.prisma.payment.findFirst({
      where: scopeFilter ? { id, AND: [scopeFilter] } : { id },
      include: paymentDetailInclude,
    });
    if (!row) {
      throw new NotFoundException('Payment not found');
    }

    const [validationSummary, anomalySummary] = await Promise.all([
      this.getValidationSummary(id),
      this.getAnomalySummary(id),
    ]);

    return toPaymentDetail(
      row,
      validationSummary,
      anomalySummary,
      this.canViewSensitive(currentUser),
    );
  }

  async generate(
    operationId: string,
    currentUserId: string,
  ): Promise<GeneratePaymentsResponseDto> {
    const operation = await this.prisma.paymentOperation.findFirst({
      where: { id: operationId, deletedAt: null },
      select: { id: true, status: true, plannedAmount: true },
    });
    if (!operation) {
      throw new NotFoundException('Operation not found');
    }
    if (!canGeneratePayments(operation.status)) {
      throw new ConflictException(
        `Payments cannot be generated while operation is ${operation.status}`,
      );
    }

    const includedAssignments =
      await this.prisma.paymentOperationBeneficiary.findMany({
        where: {
          paymentOperationId: operationId,
          status: InclusionStatus.INCLUDED,
        },
        select: { beneficiaryId: true, plannedAmount: true },
      });

    const totalIncludedAssignments = includedAssignments.length;
    if (totalIncludedAssignments === 0) {
      throw new ConflictException(
        'Operation has no INCLUDED beneficiaries to generate payments for',
      );
    }

    // Pre-fetch already-existing payments so the common idempotent re-run is
    // cheap. The DB unique(paymentOperationId, beneficiaryId) constraint is the
    // ultimate guarantee against duplicates and concurrent double-submits.
    const existing = await this.prisma.payment.findMany({
      where: { paymentOperationId: operationId },
      select: { beneficiaryId: true },
    });
    const existingSet = new Set(existing.map((p) => p.beneficiaryId));

    let created = 0;
    let skippedExisting = 0;
    let skippedMissingAmount = 0;
    const plannedAt = new Date();

    for (const assignment of includedAssignments) {
      if (existingSet.has(assignment.beneficiaryId)) {
        skippedExisting++;
        continue;
      }

      const amount = assignment.plannedAmount ?? operation.plannedAmount;
      if (amount === null || amount === undefined) {
        skippedMissingAmount++;
        continue;
      }

      try {
        await this.prisma.$transaction(async (tx) => {
          const claimCode = await this.resolveUniqueClaimCode(tx);
          const payment = await tx.payment.create({
            data: {
              paymentOperationId: operationId,
              beneficiaryId: assignment.beneficiaryId,
              amount,
              status: PaymentStatus.PENDING,
              plannedAt,
              claimCode,
            },
            select: { id: true },
          });

          await tx.paymentStatusHistory.create({
            data: {
              paymentId: payment.id,
              fromStatus: null,
              toStatus: PaymentStatus.PENDING,
              changedBy: currentUserId,
              reason: 'Generated from operation',
            },
          });
        });
        created++;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const existingPayment = await this.prisma.payment.findFirst({
            where: {
              paymentOperationId: operationId,
              beneficiaryId: assignment.beneficiaryId,
            },
            select: { id: true },
          });
          if (existingPayment) {
            await this.anomalyDetection.detectMultiplePayment(
              assignment.beneficiaryId,
              operationId,
              existingPayment.id,
              existingPayment.id,
            );
          }
          skippedExisting++;
          continue;
        }
        throw error;
      }
    }

    await this.prisma.auditLog.create({
      data: {
        userId: currentUserId,
        action: 'payment.generate',
        entityType: 'PaymentOperation',
        entityId: operationId,
        oldValues: Prisma.DbNull,
        newValues: {
          totalIncludedAssignments,
          created,
          skippedExisting,
          skippedMissingAmount,
        },
        source: AuditSource.WEB,
      },
    });

    return {
      paymentOperationId: operationId,
      totalIncludedAssignments,
      created,
      skippedExisting,
      skippedMissingAmount,
    };
  }

  async validatePayment(
    paymentId: string,
    dto: ValidatePaymentDto,
    currentUserId: string,
  ): Promise<ValidationResponseDto> {
    // --- GPS cross-field guard ---
    // DTO-level ValidateIf only enforces longitude when latitude is present.
    // This catches the reverse case: longitude provided without latitude.
    const hasLat = dto.latitude !== undefined && dto.latitude !== null;
    const hasLon = dto.longitude !== undefined && dto.longitude !== null;
    if (hasLon && !hasLat) {
      throw new BadRequestException(
        'latitude is required when longitude is provided',
      );
    }

    // --- Idempotency check (outside transaction, before PAID guard) ---
    // If a prior ACCEPTED validation exists with the same key, return it as-is.
    if (dto.idempotencyKey) {
      const existing = await this.prisma.paymentValidation.findFirst({
        where: {
          paymentId,
          idempotencyKey: dto.idempotencyKey,
          outcome: ValidationOutcome.ACCEPTED,
        },
        select: {
          id: true,
          paymentId: true,
          outcome: true,
          authMethod: true,
          recipientType: true,
          recipientName: true,
          latitude: true,
          longitude: true,
          idempotencyKey: true,
          validatedAt: true,
        },
      });

      if (existing) {
        // Re-fetch current payment status (it should be PAID).
        const payment = await this.prisma.payment.findUnique({
          where: { id: paymentId },
          select: { status: true, paidAt: true },
        });

        return {
          validationId: existing.id,
          paymentId: existing.paymentId,
          outcome: existing.outcome,
          paymentStatus: payment?.status ?? PaymentStatus.PAID,
          paidAt: payment?.paidAt ?? null,
          validatedAt: existing.validatedAt,
          agentId: dto.agentId,
          deviceId: dto.deviceId,
          authMethod: existing.authMethod,
          recipientType: existing.recipientType,
          recipientName: existing.recipientName ?? null,
          latitude: existing.latitude?.toString() ?? null,
          longitude: existing.longitude?.toString() ?? null,
          notes: dto.notes ?? null,
          idempotencyKey: existing.idempotencyKey ?? dto.idempotencyKey,
        };
      }
    }

    // --- Main transaction: all guards + all writes ---
    const result = await this.prisma.$transaction(
      async (tx) => {
        // 1. Payment existence + status guard
        const payment = await tx.payment.findUnique({
          where: { id: paymentId },
          select: {
            id: true,
            status: true,
            paymentOperationId: true,
            beneficiaryId: true,
            amount: true,
          },
        });
        if (!payment) throw new NotFoundException('Payment not found');

        if (payment.status === PaymentStatus.PAID) {
          throw new ConflictException('Payment is already PAID');
        }
        if (payment.status === PaymentStatus.CANCELLED) {
          throw new ConflictException('Cannot validate a CANCELLED payment');
        }
        if (!canValidatePayment(payment.status)) {
          throw new ConflictException(
            `Payment status ${payment.status} does not allow validation`,
          );
        }

        // 2. Operation status guard
        const operation = await tx.paymentOperation.findUnique({
          where: { id: payment.paymentOperationId },
          select: { id: true, status: true },
        });
        if (!operation) throw new NotFoundException('Payment operation not found');
        if (!canValidateOnOperation(operation.status)) {
          throw new ConflictException(
            `Payment operation is not open for field validation (status: ${operation.status})`,
          );
        }

        // 3. Beneficiary inclusion guard
        const inclusion = await tx.paymentOperationBeneficiary.findUnique({
          where: {
            paymentOperationId_beneficiaryId: {
              paymentOperationId: payment.paymentOperationId,
              beneficiaryId: payment.beneficiaryId,
            },
          },
          select: { status: true },
        });
        if (!inclusion || inclusion.status !== InclusionStatus.INCLUDED) {
          throw new ConflictException(
            'Beneficiary is not included in this payment operation',
          );
        }

        // 4. Agent guard
        const agent = await tx.agent.findFirst({
          where: { id: dto.agentId, deletedAt: null },
          select: { id: true, userId: true, status: true },
        });
        if (!agent) throw new NotFoundException('Agent not found');
        if (agent.status !== AgentStatus.ACTIVE) {
          throw new ConflictException(
            `Agent is not ACTIVE (current status: ${agent.status})`,
          );
        }

        // 5. Agent-user binding: agent.userId must match the authenticated user.
        if (agent.userId !== currentUserId) {
          throw new ForbiddenException(
            'You are not authorized to validate payments on behalf of this agent',
          );
        }

        // 6. OperationAgent assignment guard
        const operationAgent = await tx.operationAgent.findUnique({
          where: {
            paymentOperationId_agentId: {
              paymentOperationId: payment.paymentOperationId,
              agentId: dto.agentId,
            },
          },
          select: { status: true },
        });
        if (!operationAgent || operationAgent.status !== OperationAgentStatus.ACTIVE) {
          throw new ForbiddenException(
            'Agent is not assigned to this payment operation',
          );
        }

        // 7. Device guard
        const device = await tx.device.findFirst({
          where: { id: dto.deviceId, deletedAt: null },
          select: { id: true, agentId: true, status: true },
        });
        if (!device) throw new NotFoundException('Device not found');
        if (device.status !== DeviceStatus.ACTIVE) {
          throw new ConflictException(
            `Device is not ACTIVE (current status: ${device.status})`,
          );
        }
        if (device.agentId !== dto.agentId) {
          throw new ForbiddenException('Device does not belong to this agent');
        }

        // --- All guards passed. Execute writes. ---
        const now = new Date();
        const fromStatus = payment.status;

        // 8. Create PaymentValidation
        const validation = await tx.paymentValidation.create({
          data: {
            paymentId,
            agentId: dto.agentId,
            deviceId: dto.deviceId,
            outcome: ValidationOutcome.ACCEPTED,
            authMethod: dto.authMethod,
            recipientType: dto.recipientType,
            recipientName: dto.recipientName ?? undefined,
            latitude:
              dto.latitude !== undefined && dto.latitude !== null
                ? new Prisma.Decimal(dto.latitude)
                : undefined,
            longitude:
              dto.longitude !== undefined && dto.longitude !== null
                ? new Prisma.Decimal(dto.longitude)
                : undefined,
            idempotencyKey: dto.idempotencyKey,
            validatedAt: now,
          },
          select: {
            id: true,
            latitude: true,
            longitude: true,
            validatedAt: true,
          },
        });

        // 9. Update payment to PAID
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentStatus.PAID,
            paidAt: now,
          },
        });

        // 10. PaymentStatusHistory
        await tx.paymentStatusHistory.create({
          data: {
            paymentId,
            fromStatus,
            toStatus: PaymentStatus.PAID,
            changedBy: currentUserId,
            reason: 'Payment validated in field',
          },
        });

        // 11. AuditLog
        await tx.auditLog.create({
          data: {
            userId: currentUserId,
            action: 'payment.validate.accepted',
            entityType: 'Payment',
            entityId: paymentId,
            oldValues: { status: fromStatus },
            newValues: {
              status: PaymentStatus.PAID,
              paidAt: now.toISOString(),
              validationId: validation.id,
              agentId: dto.agentId,
              deviceId: dto.deviceId,
              authMethod: dto.authMethod,
              recipientType: dto.recipientType,
              latitude: dto.latitude ?? null,
              longitude: dto.longitude ?? null,
            },
            source: AuditSource.WEB,
            deviceId: dto.deviceId,
          },
        });

        return {
          validationId: validation.id,
          fromStatus,
          paidAt: now,
          validatedAt: validation.validatedAt,
          latitudeDecimal: validation.latitude,
          longitudeDecimal: validation.longitude,
          beneficiaryId: payment.beneficiaryId,
          paymentOperationId: payment.paymentOperationId,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    const hasGps =
      dto.latitude !== undefined &&
      dto.latitude !== null &&
      dto.longitude !== undefined &&
      dto.longitude !== null;
    if (!hasGps) {
      await this.anomalyDetection.detectMissingGps(
        paymentId,
        result.beneficiaryId,
        result.paymentOperationId,
        dto.agentId,
        dto.deviceId,
      );
    }

    return {
      validationId: result.validationId,
      paymentId,
      outcome: ValidationOutcome.ACCEPTED,
      paymentStatus: PaymentStatus.PAID,
      paidAt: result.paidAt,
      validatedAt: result.validatedAt,
      agentId: dto.agentId,
      deviceId: dto.deviceId,
      authMethod: dto.authMethod,
      recipientType: dto.recipientType,
      recipientName: dto.recipientName ?? null,
      latitude: result.latitudeDecimal?.toString() ?? null,
      longitude: result.longitudeDecimal?.toString() ?? null,
      notes: dto.notes ?? null,
      idempotencyKey: dto.idempotencyKey,
    };
  }

  async cancel(
    id: string,
    dto: CancelPaymentDto,
    currentUser: AuthenticatedUser,
  ): Promise<PaymentDetailDto> {
    const currentUserId = currentUser.id;
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!existing) {
        throw new NotFoundException('Payment not found');
      }

      if (existing.status === PaymentStatus.PAID) {
        throw new ConflictException('Cannot cancel a paid payment');
      }
      if (existing.status === PaymentStatus.CANCELLED) {
        throw new ConflictException('Payment is already cancelled');
      }
      if (!canCancelPayment(existing.status)) {
        throw new ConflictException(
          `Payment cannot be cancelled from status ${existing.status}`,
        );
      }

      const { count } = await tx.payment.updateMany({
        where: {
          id,
          status: { in: [...CANCELLABLE_PAYMENT_STATUSES] },
        },
        data: {
          status: PaymentStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });

      if (count === 0) {
        const current = await tx.payment.findUnique({
          where: { id },
          select: { status: true },
        });
        if (current?.status === PaymentStatus.CANCELLED) {
          throw new ConflictException('Payment is already cancelled');
        }
        throw new ConflictException(
          `Payment cannot be cancelled from status ${current?.status}`,
        );
      }

      await tx.paymentStatusHistory.create({
        data: {
          paymentId: id,
          fromStatus: existing.status,
          toStatus: PaymentStatus.CANCELLED,
          changedBy: currentUserId,
          reason: dto.reason,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: currentUserId,
          action: 'payment.cancel',
          entityType: 'Payment',
          entityId: id,
          oldValues: { status: existing.status },
          newValues: { status: PaymentStatus.CANCELLED, reason: dto.reason ?? null },
          source: AuditSource.WEB,
        },
      });
    });

    return this.findOne(id, currentUser);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildWhere(
    query: PaymentQueryDto,
    currentUser: AuthenticatedUser,
  ): Prisma.PaymentWhereInput {
    const where: Prisma.PaymentWhereInput = {};
    const and: Prisma.PaymentWhereInput[] = [];

    const scopeFilter = this.buildScopeFilter(currentUser);
    if (scopeFilter) and.push(scopeFilter);

    if (query.search) {
      and.push({
        beneficiary: {
          OR: [
            { fullName: { contains: query.search, mode: 'insensitive' } },
            { registryCode: { contains: query.search, mode: 'insensitive' } },
            { nni: { contains: query.search, mode: 'insensitive' } },
          ],
        },
      });
    }
    if (query.status) and.push({ status: query.status });
    if (query.syncStatus) and.push({ syncStatus: query.syncStatus });
    if (query.paymentOperationId)
      and.push({ paymentOperationId: query.paymentOperationId });
    if (query.beneficiaryId) and.push({ beneficiaryId: query.beneficiaryId });
    if (query.socialProgramId)
      and.push({ paymentOperation: { socialProgramId: query.socialProgramId } });

    // Geography filters resolve through the beneficiary's locality hierarchy.
    if (query.localityId)
      and.push({ beneficiary: { localityId: query.localityId } });
    if (query.communeId)
      and.push({ beneficiary: { locality: { communeId: query.communeId } } });
    if (query.moughataaId)
      and.push({
        beneficiary: {
          locality: { commune: { moughataaId: query.moughataaId } },
        },
      });
    if (query.regionId)
      and.push({
        beneficiary: {
          locality: { commune: { moughataa: { regionId: query.regionId } } },
        },
      });

    if (query.dateFrom || query.dateTo) {
      const plannedAt: Prisma.DateTimeNullableFilter = {};
      if (query.dateFrom) plannedAt.gte = new Date(query.dateFrom);
      if (query.dateTo) plannedAt.lte = new Date(query.dateTo);
      and.push({ plannedAt });
    }

    if (and.length > 0) where.AND = and;
    return where;
  }

  // Institutional scoping (INSTITUTIONAL-RBAC-2):
  // - ADMIN_TAAZOUR: unrestricted.
  // - PROGRAMME: only payments belonging to an operation of a scoped programme.
  // - OPERATOR: only payments belonging to an operation assigned to that operator.
  // A PROGRAMME/OPERATOR user with no scope configured sees zero rows.
  private buildScopeFilter(
    currentUser: AuthenticatedUser,
  ): Prisma.PaymentWhereInput | null {
    if (currentUser.roles.includes('ADMIN_TAAZOUR')) {
      return null;
    }

    if (currentUser.roles.includes('PROGRAMME')) {
      return {
        paymentOperation: {
          socialProgramId: { in: currentUser.programmeIds },
        },
      };
    }

    if (currentUser.roles.includes('OPERATOR')) {
      if (!currentUser.operatorId) {
        return { id: '' };
      }
      return { paymentOperation: { operatorId: currentUser.operatorId } };
    }

    return { id: '' };
  }

  private canViewSensitive(currentUser: AuthenticatedUser): boolean {
    return currentUser.permissions.includes('beneficiaries.read_sensitive');
  }

  // Server-generated, cryptographically random claim code — never derived
  // from NNI, phone, or any other beneficiary-identifying data, and not
  // guessable from a payment/beneficiary id. Retries on the (very unlikely)
  // event of a collision against the unique constraint.
  private async resolveUniqueClaimCode(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const candidate = this.generateClaimCode();
      const existing = await tx.payment.findUnique({
        where: { claimCode: candidate },
        select: { id: true },
      });
      if (!existing) {
        return candidate;
      }
    }
    throw new ConflictException(
      'Could not generate a unique claim code, please retry',
    );
  }

  private generateClaimCode(): string {
    // 10 random base32-ish uppercase alphanumeric characters, grouped for
    // readability (e.g. CLM-7F2K9-QX3ZP). Purely random: no timestamp, no
    // sequential component, no beneficiary/payment data.
    const raw = randomBytes(8).toString('hex').toUpperCase().slice(0, 10);
    return `CLM-${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
  }

  private async getValidationSummary(
    paymentId: string,
  ): Promise<PaymentValidationSummaryDto> {
    // Read-only summary. This module NEVER creates PaymentValidation records.
    const [grouped, lastValidated] = await Promise.all([
      this.prisma.paymentValidation.groupBy({
        by: ['outcome'],
        where: { paymentId },
        _count: { _all: true },
      }),
      this.prisma.paymentValidation.findFirst({
        where: { paymentId },
        orderBy: { validatedAt: 'desc' },
        select: { validatedAt: true },
      }),
    ]);

    let total = 0;
    let accepted = 0;
    let rejected = 0;
    let attempted = 0;
    for (const g of grouped) {
      const count = g._count._all;
      total += count;
      if (g.outcome === ValidationOutcome.ACCEPTED) accepted = count;
      else if (g.outcome === ValidationOutcome.REJECTED) rejected = count;
      else if (g.outcome === ValidationOutcome.ATTEMPTED) attempted = count;
    }

    return {
      total,
      accepted,
      rejected,
      attempted,
      lastValidatedAt: lastValidated?.validatedAt ?? null,
    };
  }

  private async getAnomalySummary(
    paymentId: string,
  ): Promise<PaymentAnomalySummaryDto> {
    const [total, open] = await Promise.all([
      this.prisma.anomaly.count({ where: { paymentId } }),
      this.prisma.anomaly.count({ where: { paymentId, status: 'OPEN' } }),
    ]);
    return { open, total };
  }
}
