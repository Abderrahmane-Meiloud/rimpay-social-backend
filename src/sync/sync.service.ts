import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  AgentStatus,
  AuditSource,
  DeviceStatus,
  InclusionStatus,
  OperationAgentStatus,
  PaymentStatus,
  Prisma,
  SyncBatchStatus,
  SyncItemStatus,
  SyncStatus,
  ValidationOutcome,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnomalyDetectionService } from '../anomalies/anomaly-detection.service';
import {
  buildPaginatedResponse,
  PaginatedResponseDto,
} from '../common/dto/paginated-response.dto';
import { CreateSyncBatchDto } from './dto/create-sync-batch.dto';
import { SyncItemDto } from './dto/sync-item.dto';
import { PaymentValidationSyncPayloadDto } from './dto/payment-validation-sync-payload.dto';
import { SyncBatchQueryDto } from './dto/sync-batch-query.dto';
import {
  SyncBatchDetailDto,
  SyncBatchResponseDto,
  SyncBatchSummaryDto,
  SyncItemResultDto,
} from './dto/sync-batch-response.dto';

const ITEM_TYPE_PAYMENT_VALIDATION = 'payment.validation';

type ItemOutcome = {
  status: SyncItemStatus;
  errorMessage: string | null;
  linkedPaymentId: string | null;
  processedAt: Date | null;
};

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anomalyDetection: AnomalyDetectionService,
  ) {}

  // ---------------------------------------------------------------------------
  // POST /sync/batches
  // ---------------------------------------------------------------------------

  async submitBatch(
    dto: CreateSyncBatchDto,
    currentUserId: string,
  ): Promise<SyncBatchResponseDto> {
    // --- Batch-level identity / security guards ---
    const agent = await this.prisma.agent.findFirst({
      where: { id: dto.agentId, deletedAt: null },
      select: { id: true, userId: true, status: true },
    });
    if (!agent) throw new BadRequestException('Agent not found');
    if (agent.status !== AgentStatus.ACTIVE) {
      throw new BadRequestException(
        `Agent is not ACTIVE (current status: ${agent.status})`,
      );
    }
    if (agent.userId !== currentUserId) {
      throw new ForbiddenException(
        'You are not authorized to submit sync batches on behalf of this agent',
      );
    }

    const device = await this.prisma.device.findFirst({
      where: { id: dto.deviceId, deletedAt: null },
      select: { id: true, agentId: true, status: true },
    });
    if (!device) {
      await this.anomalyDetection.detectUnknownDevice(dto.deviceId, dto.agentId, null, null, false);
      throw new BadRequestException('Device not found');
    }
    if (device.status !== DeviceStatus.ACTIVE) {
      await this.anomalyDetection.detectUnknownDevice(dto.deviceId, dto.agentId, null, null, true);
      throw new BadRequestException(
        `Device is not ACTIVE (current status: ${device.status})`,
      );
    }
    if (device.agentId !== dto.agentId) {
      throw new BadRequestException('Device does not belong to this agent');
    }

    // --- Duplicate batchUid check ---
    const existingBatch = await this.prisma.syncBatch.findUnique({
      where: { batchUid: dto.batchUid },
      include: { syncItems: true },
    });

    if (existingBatch) {
      if (
        existingBatch.agentId !== dto.agentId ||
        existingBatch.deviceId !== dto.deviceId
      ) {
        throw new ConflictException(
          'A batch with this batchUid already exists from a different agent or device',
        );
      }
      // Same agent+device — return existing result idempotently.
      return this.toBatchResponse(existingBatch, existingBatch.syncItems, true);
    }

    // --- Create SyncBatch: RECEIVED → PROCESSING ---
    const batch = await this.prisma.syncBatch.create({
      data: {
        batchUid: dto.batchUid,
        agentId: dto.agentId,
        deviceId: dto.deviceId,
        status: SyncBatchStatus.RECEIVED,
        totalItems: dto.items.length,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
      },
      select: { id: true },
    });
    const batchId = batch.id;

    await this.prisma.syncBatch.update({
      where: { id: batchId },
      data: { status: SyncBatchStatus.PROCESSING },
    });

    // --- Process items independently ---
    const itemResults: Array<SyncItemDto & ItemOutcome> = [];

    for (const item of dto.items) {
      const outcome = await this.processItem(
        batchId,
        dto.deviceId,
        dto.agentId,
        currentUserId,
        item,
      );
      itemResults.push({ ...item, ...outcome });
    }

    // --- Compute final counters ---
    let acceptedItems = 0;
    let rejectedItems = 0;
    let conflictItems = 0;

    for (const r of itemResults) {
      if (r.status === SyncItemStatus.ACCEPTED) acceptedItems++;
      else if (r.status === SyncItemStatus.CONFLICT) conflictItems++;
      else rejectedItems++;
    }

    const finalStatus =
      acceptedItems === itemResults.length
        ? SyncBatchStatus.COMPLETED
        : acceptedItems > 0
          ? SyncBatchStatus.PARTIAL_FAILED
          : SyncBatchStatus.FAILED;

    const now = new Date();

    const updatedBatch = await this.prisma.syncBatch.update({
      where: { id: batchId },
      data: {
        status: finalStatus,
        acceptedItems,
        rejectedItems,
        conflictItems,
        completedAt: now,
      },
      select: {
        id: true,
        batchUid: true,
        status: true,
        totalItems: true,
        acceptedItems: true,
        rejectedItems: true,
        conflictItems: true,
        startedAt: true,
        completedAt: true,
      },
    });

    // Fetch final SyncItem rows (authoritative, includes processedAt from DB).
    const syncItems = await this.prisma.syncItem.findMany({
      where: { syncBatchId: batchId },
      select: {
        localId: true,
        itemType: true,
        idempotencyKey: true,
        status: true,
        errorMessage: true,
        linkedPaymentId: true,
        processedAt: true,
      },
    });

    // Preserve input ordering; fall back to in-memory result for any item
    // whose SyncItem row was never written (should not happen in normal flow).
    const itemResultDtos: SyncItemResultDto[] = dto.items.map((item) => {
      const dbRow = syncItems.find(
        (r) => r.localId === item.localId && r.itemType === item.itemType,
      );
      if (dbRow) {
        return {
          localId: dbRow.localId,
          itemType: dbRow.itemType,
          idempotencyKey: dbRow.idempotencyKey,
          status: dbRow.status,
          errorMessage: dbRow.errorMessage ?? null,
          linkedPaymentId: dbRow.linkedPaymentId ?? null,
          processedAt: dbRow.processedAt ?? null,
        };
      }
      const mem = itemResults.find(
        (r) => r.localId === item.localId && r.itemType === item.itemType,
      );
      return {
        localId: item.localId,
        itemType: item.itemType,
        idempotencyKey: item.idempotencyKey,
        status: mem?.status ?? SyncItemStatus.REJECTED,
        errorMessage: mem?.errorMessage ?? null,
        linkedPaymentId: mem?.linkedPaymentId ?? null,
        processedAt: mem?.processedAt ?? null,
      };
    });

    return {
      batchId: updatedBatch.id,
      batchUid: updatedBatch.batchUid,
      status: updatedBatch.status,
      alreadyProcessed: false,
      totalItems: updatedBatch.totalItems,
      acceptedItems: updatedBatch.acceptedItems,
      rejectedItems: updatedBatch.rejectedItems,
      conflictItems: updatedBatch.conflictItems,
      startedAt: updatedBatch.startedAt ?? null,
      completedAt: updatedBatch.completedAt ?? null,
      items: itemResultDtos,
    };
  }

  // ---------------------------------------------------------------------------
  // GET /sync/batches
  // ---------------------------------------------------------------------------

  async findAll(
    query: SyncBatchQueryDto,
  ): Promise<PaginatedResponseDto<SyncBatchSummaryDto>> {
    const where = this.buildWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.syncBatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          batchUid: true,
          status: true,
          totalItems: true,
          acceptedItems: true,
          rejectedItems: true,
          conflictItems: true,
          startedAt: true,
          completedAt: true,
          agentId: true,
          deviceId: true,
          createdAt: true,
        },
      }),
      this.prisma.syncBatch.count({ where }),
    ]);

    return buildPaginatedResponse(
      rows.map((r) => ({
        id: r.id,
        batchUid: r.batchUid,
        status: r.status,
        totalItems: r.totalItems,
        acceptedItems: r.acceptedItems,
        rejectedItems: r.rejectedItems,
        conflictItems: r.conflictItems,
        startedAt: r.startedAt ?? null,
        completedAt: r.completedAt ?? null,
        agentId: r.agentId,
        deviceId: r.deviceId,
        createdAt: r.createdAt,
      })),
      total,
      query.page,
      query.limit,
    );
  }

  // ---------------------------------------------------------------------------
  // GET /sync/batches/:id
  // ---------------------------------------------------------------------------

  async findOne(id: string): Promise<SyncBatchDetailDto> {
    const batch = await this.prisma.syncBatch.findUnique({
      where: { id },
      include: {
        syncItems: {
          select: {
            localId: true,
            itemType: true,
            idempotencyKey: true,
            status: true,
            errorMessage: true,
            linkedPaymentId: true,
            processedAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!batch) throw new NotFoundException('Sync batch not found');

    return {
      id: batch.id,
      batchUid: batch.batchUid,
      status: batch.status,
      totalItems: batch.totalItems,
      acceptedItems: batch.acceptedItems,
      rejectedItems: batch.rejectedItems,
      conflictItems: batch.conflictItems,
      startedAt: batch.startedAt ?? null,
      completedAt: batch.completedAt ?? null,
      agentId: batch.agentId,
      deviceId: batch.deviceId,
      createdAt: batch.createdAt,
      items: batch.syncItems.map((i) => ({
        localId: i.localId,
        itemType: i.itemType,
        idempotencyKey: i.idempotencyKey,
        status: i.status,
        errorMessage: i.errorMessage ?? null,
        linkedPaymentId: i.linkedPaymentId ?? null,
        processedAt: i.processedAt ?? null,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Item processing — durable lifecycle
  // ---------------------------------------------------------------------------
  //
  // Every non-duplicate item follows this invariant:
  //   1. INSERT SyncItem with status=PENDING  (durable checkpoint)
  //   2. Process / validate
  //   3. UPDATE SyncItem to final status (ACCEPTED / REJECTED / CONFLICT)
  //
  // For ACCEPTED payment.validation items, steps 2+3 happen inside a single
  // Prisma transaction so that SyncItem, PaymentValidation, Payment, history,
  // and audit log are committed atomically.

  private async processItem(
    batchId: string,
    deviceId: string,
    agentId: string,
    currentUserId: string,
    item: SyncItemDto,
  ): Promise<ItemOutcome> {
    // --- Duplicate guard: same device+localId+itemType already processed ---
    const existingItem = await this.prisma.syncItem.findUnique({
      where: {
        deviceId_localId_itemType: {
          deviceId,
          localId: item.localId,
          itemType: item.itemType,
        },
      },
      select: {
        status: true,
        errorMessage: true,
        linkedPaymentId: true,
        processedAt: true,
      },
    });

    if (existingItem) {
      // Return existing outcome as-is — do not reprocess.
      return {
        status: existingItem.status,
        errorMessage: existingItem.errorMessage ?? null,
        linkedPaymentId: existingItem.linkedPaymentId ?? null,
        processedAt: existingItem.processedAt ?? null,
      };
    }

    // --- Step 1: create durable PENDING SyncItem ---
    let syncItemId: string;
    try {
      const created = await this.prisma.syncItem.create({
        data: {
          syncBatchId: batchId,
          deviceId,
          localId: item.localId,
          itemType: item.itemType,
          idempotencyKey: item.idempotencyKey,
          payload: item.payload as Prisma.InputJsonValue,
          status: SyncItemStatus.PENDING,
        },
        select: { id: true },
      });
      syncItemId = created.id;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Race: another request inserted this item concurrently — fetch and return.
        const existing = await this.prisma.syncItem.findUnique({
          where: {
            deviceId_localId_itemType: {
              deviceId,
              localId: item.localId,
              itemType: item.itemType,
            },
          },
          select: { status: true, errorMessage: true, linkedPaymentId: true, processedAt: true },
        });
        if (existing) {
          return {
            status: existing.status,
            errorMessage: existing.errorMessage ?? null,
            linkedPaymentId: existing.linkedPaymentId ?? null,
            processedAt: existing.processedAt ?? null,
          };
        }
      }
      throw err;
    }

    // --- Step 2 + 3: process and update SyncItem to final status ---
    return this.processAndFinalize(syncItemId, batchId, deviceId, agentId, currentUserId, item);
  }

  private async processAndFinalize(
    syncItemId: string,
    batchId: string,
    deviceId: string,
    agentId: string,
    currentUserId: string,
    item: SyncItemDto,
  ): Promise<ItemOutcome> {
    // --- Unknown item type ---
    if (item.itemType !== ITEM_TYPE_PAYMENT_VALIDATION) {
      return this.finalizeItem(syncItemId, {
        status: SyncItemStatus.REJECTED,
        errorMessage: `Unknown item type: ${item.itemType}`,
        linkedPaymentId: null,
        processedAt: new Date(),
      });
    }

    // --- Validate payload structure ---
    const payloadErrors = await this.validatePaymentValidationPayload(item.payload);
    if (payloadErrors.length > 0) {
      return this.finalizeItem(syncItemId, {
        status: SyncItemStatus.REJECTED,
        errorMessage: `Invalid payment.validation payload: ${payloadErrors.join('; ')}`,
        linkedPaymentId: null,
        processedAt: new Date(),
      });
    }

    const payload = item.payload as {
      paymentId: string;
      authMethod: string;
      recipientType: string;
      recipientName?: string;
      latitude?: number;
      longitude?: number;
      notes?: string;
    };

    // --- GPS cross-field guard ---
    const hasLat = payload.latitude !== undefined && payload.latitude !== null;
    const hasLon = payload.longitude !== undefined && payload.longitude !== null;
    if (hasLat !== hasLon) {
      return this.finalizeItem(syncItemId, {
        status: SyncItemStatus.REJECTED,
        errorMessage: hasLon
          ? 'latitude is required when longitude is provided'
          : 'longitude is required when latitude is provided',
        linkedPaymentId: null,
        processedAt: new Date(),
      });
    }

    // --- Idempotency: existing ACCEPTED validation with same idempotencyKey ---
    const existingValidation = await this.prisma.paymentValidation.findFirst({
      where: {
        paymentId: payload.paymentId,
        idempotencyKey: item.idempotencyKey,
        outcome: ValidationOutcome.ACCEPTED,
      },
      select: { id: true },
    });

    if (existingValidation) {
      return this.finalizeItem(syncItemId, {
        status: SyncItemStatus.ACCEPTED,
        errorMessage: null,
        linkedPaymentId: payload.paymentId,
        processedAt: new Date(),
      });
    }

    // --- Full validation + writes in a single transaction ---
    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        // 1. Payment
        const payment = await tx.payment.findUnique({
          where: { id: payload.paymentId },
          select: {
            id: true,
            status: true,
            paymentOperationId: true,
            beneficiaryId: true,
            syncStatus: true,
          },
        });
        if (!payment) {
          return {
            status: SyncItemStatus.REJECTED,
            errorMessage: 'Payment not found',
            linkedPaymentId: null as string | null,
          };
        }

        // PAID + different idempotencyKey → CONFLICT
        if (payment.status === PaymentStatus.PAID) {
          await tx.payment.update({
            where: { id: payment.id },
            data: { syncStatus: SyncStatus.CONFLICT },
          });
          await tx.syncItem.update({
            where: { id: syncItemId },
            data: {
              status: SyncItemStatus.CONFLICT,
              errorMessage: 'Payment already validated',
              linkedPaymentId: payment.id,
              processedAt: new Date(),
            },
          });
          await this.anomalyDetection.detectPaymentAlreadyValidated(
            payment.id,
            payment.beneficiaryId,
            payment.paymentOperationId,
            agentId,
            deviceId,
            batchId,
            syncItemId,
            tx,
          );
          await this.anomalyDetection.detectSyncConflict(
            payment.id,
            batchId,
            syncItemId,
            agentId,
            deviceId,
            tx,
          );
          return {
            status: SyncItemStatus.CONFLICT,
            errorMessage: 'Payment already validated',
            linkedPaymentId: payment.id,
          };
        }

        if (payment.status === PaymentStatus.CANCELLED) {
          await tx.syncItem.update({
            where: { id: syncItemId },
            data: {
              status: SyncItemStatus.REJECTED,
              errorMessage: 'Payment is CANCELLED',
              linkedPaymentId: payment.id,
              processedAt: new Date(),
            },
          });
          return {
            status: SyncItemStatus.REJECTED,
            errorMessage: 'Payment is CANCELLED',
            linkedPaymentId: payment.id,
          };
        }

        const validatableStatuses: PaymentStatus[] = [
          PaymentStatus.PENDING,
          PaymentStatus.VALIDATED,
          PaymentStatus.REJECTED,
          PaymentStatus.CONFLICT,
        ];
        if (!validatableStatuses.includes(payment.status)) {
          await tx.syncItem.update({
            where: { id: syncItemId },
            data: {
              status: SyncItemStatus.REJECTED,
              errorMessage: `Payment status ${payment.status} does not allow validation`,
              linkedPaymentId: payment.id,
              processedAt: new Date(),
            },
          });
          return {
            status: SyncItemStatus.REJECTED,
            errorMessage: `Payment status ${payment.status} does not allow validation`,
            linkedPaymentId: payment.id,
          };
        }

        // 2. Operation
        const operation = await tx.paymentOperation.findUnique({
          where: { id: payment.paymentOperationId },
          select: { status: true },
        });
        const validatableOpStatuses = ['OPEN', 'IN_PROGRESS'];
        if (!operation || !validatableOpStatuses.includes(operation.status)) {
          const msg = `Payment operation is not open for field validation (status: ${operation?.status ?? 'NOT_FOUND'})`;
          await tx.syncItem.update({
            where: { id: syncItemId },
            data: {
              status: SyncItemStatus.REJECTED,
              errorMessage: msg,
              linkedPaymentId: payment.id,
              processedAt: new Date(),
            },
          });
          return { status: SyncItemStatus.REJECTED, errorMessage: msg, linkedPaymentId: payment.id };
        }

        // 3. Beneficiary inclusion
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
          const msg = 'Beneficiary is not included in this payment operation';
          await tx.syncItem.update({
            where: { id: syncItemId },
            data: {
              status: SyncItemStatus.REJECTED,
              errorMessage: msg,
              linkedPaymentId: payment.id,
              processedAt: new Date(),
            },
          });
          return { status: SyncItemStatus.REJECTED, errorMessage: msg, linkedPaymentId: payment.id };
        }

        // 4. Agent (re-read inside tx for consistency)
        const agent = await tx.agent.findFirst({
          where: { id: agentId, deletedAt: null },
          select: { status: true, userId: true },
        });
        if (!agent || agent.status !== AgentStatus.ACTIVE) {
          const msg = 'Agent is not ACTIVE';
          await tx.syncItem.update({
            where: { id: syncItemId },
            data: { status: SyncItemStatus.REJECTED, errorMessage: msg, linkedPaymentId: payment.id, processedAt: new Date() },
          });
          return { status: SyncItemStatus.REJECTED, errorMessage: msg, linkedPaymentId: payment.id };
        }
        if (agent.userId !== currentUserId) {
          const msg = 'Agent does not belong to the authenticated user';
          await tx.syncItem.update({
            where: { id: syncItemId },
            data: { status: SyncItemStatus.REJECTED, errorMessage: msg, linkedPaymentId: payment.id, processedAt: new Date() },
          });
          return { status: SyncItemStatus.REJECTED, errorMessage: msg, linkedPaymentId: payment.id };
        }

        // 5. OperationAgent assignment
        const operationAgent = await tx.operationAgent.findUnique({
          where: {
            paymentOperationId_agentId: {
              paymentOperationId: payment.paymentOperationId,
              agentId,
            },
          },
          select: { status: true },
        });
        if (!operationAgent || operationAgent.status !== OperationAgentStatus.ACTIVE) {
          const msg = 'Agent is not assigned to this payment operation';
          await tx.syncItem.update({
            where: { id: syncItemId },
            data: { status: SyncItemStatus.REJECTED, errorMessage: msg, linkedPaymentId: payment.id, processedAt: new Date() },
          });
          await this.anomalyDetection.detectAgentNotAssigned(
            agentId,
            payment.paymentOperationId,
            batchId,
            syncItemId,
            deviceId,
            tx,
          );
          return { status: SyncItemStatus.REJECTED, errorMessage: msg, linkedPaymentId: payment.id };
        }

        // 6. Device (re-read inside tx)
        const device = await tx.device.findFirst({
          where: { id: deviceId, deletedAt: null },
          select: { status: true, agentId: true },
        });
        if (!device || device.status !== DeviceStatus.ACTIVE) {
          const msg = 'Device is not ACTIVE';
          await tx.syncItem.update({
            where: { id: syncItemId },
            data: { status: SyncItemStatus.REJECTED, errorMessage: msg, linkedPaymentId: payment.id, processedAt: new Date() },
          });
          return { status: SyncItemStatus.REJECTED, errorMessage: msg, linkedPaymentId: payment.id };
        }
        if (device.agentId !== agentId) {
          const msg = 'Device does not belong to this agent';
          await tx.syncItem.update({
            where: { id: syncItemId },
            data: { status: SyncItemStatus.REJECTED, errorMessage: msg, linkedPaymentId: payment.id, processedAt: new Date() },
          });
          return { status: SyncItemStatus.REJECTED, errorMessage: msg, linkedPaymentId: payment.id };
        }

        // --- All guards passed: write PaymentValidation, update Payment,
        //     create PaymentStatusHistory, AuditLog, and update SyncItem
        //     to ACCEPTED — all in this same transaction. ---
        const now = new Date();
        const fromStatus = payment.status;

        const validation = await tx.paymentValidation.create({
          data: {
            paymentId: payment.id,
            agentId,
            deviceId,
            syncBatchId: batchId,
            outcome: ValidationOutcome.ACCEPTED,
            authMethod: payload.authMethod as never,
            recipientType: payload.recipientType as never,
            recipientName: payload.recipientName ?? undefined,
            latitude:
              hasLat ? new Prisma.Decimal(payload.latitude!) : undefined,
            longitude:
              hasLon ? new Prisma.Decimal(payload.longitude!) : undefined,
            idempotencyKey: item.idempotencyKey,
            validatedAt: now,
          },
          select: { id: true },
        });

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.PAID,
            paidAt: now,
            syncStatus: SyncStatus.SYNCED,
          },
        });

        await tx.paymentStatusHistory.create({
          data: {
            paymentId: payment.id,
            fromStatus,
            toStatus: PaymentStatus.PAID,
            changedBy: currentUserId,
            reason: 'Payment validated in field (offline sync)',
          },
        });

        await tx.auditLog.create({
          data: {
            userId: currentUserId,
            action: 'payment.validate.accepted',
            entityType: 'Payment',
            entityId: payment.id,
            oldValues: { status: fromStatus },
            newValues: {
              status: PaymentStatus.PAID,
              paidAt: now.toISOString(),
              syncStatus: SyncStatus.SYNCED,
              validationId: validation.id,
              agentId,
              deviceId,
              syncBatchId: batchId,
              authMethod: payload.authMethod,
              recipientType: payload.recipientType,
              latitude: payload.latitude ?? null,
              longitude: payload.longitude ?? null,
            },
            source: AuditSource.MOBILE,
            deviceId,
          },
        });

        // Update SyncItem to ACCEPTED inside the same transaction.
        await tx.syncItem.update({
          where: { id: syncItemId },
          data: {
            status: SyncItemStatus.ACCEPTED,
            linkedPaymentId: payment.id,
            processedAt: now,
          },
        });

        if (!(hasLat && hasLon)) {
          await this.anomalyDetection.detectMissingGps(
            payment.id,
            payment.beneficiaryId,
            payment.paymentOperationId,
            agentId,
            deviceId,
            tx,
          );
        }

        return {
          status: SyncItemStatus.ACCEPTED,
          errorMessage: null,
          linkedPaymentId: payment.id,
        };
      });

      return {
        status: outcome.status,
        errorMessage: outcome.errorMessage,
        linkedPaymentId: outcome.linkedPaymentId,
        processedAt: new Date(),
      };
    } catch (err) {
      // Unexpected error during transaction — record as REJECTED.
      const msg = err instanceof Error ? err.message : 'Unexpected processing error';
      return this.finalizeItem(syncItemId, {
        status: SyncItemStatus.REJECTED,
        errorMessage: msg,
        linkedPaymentId: null,
        processedAt: new Date(),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async finalizeItem(
    syncItemId: string,
    outcome: ItemOutcome,
  ): Promise<ItemOutcome> {
    await this.prisma.syncItem.update({
      where: { id: syncItemId },
      data: {
        status: outcome.status,
        errorMessage: outcome.errorMessage ?? undefined,
        linkedPaymentId: outcome.linkedPaymentId ?? undefined,
        processedAt: outcome.processedAt ?? undefined,
      },
    });
    return outcome;
  }

  private async validatePaymentValidationPayload(
    payload: Record<string, unknown>,
  ): Promise<string[]> {
    const instance = plainToInstance(PaymentValidationSyncPayloadDto, payload);
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: false,
      skipMissingProperties: false,
    });
    return errors.flatMap((e) => Object.values(e.constraints ?? {}));
  }

  private buildWhere(query: SyncBatchQueryDto): Prisma.SyncBatchWhereInput {
    const where: Prisma.SyncBatchWhereInput = {};
    const and: Prisma.SyncBatchWhereInput[] = [];

    if (query.status) and.push({ status: query.status });
    if (query.agentId) and.push({ agentId: query.agentId });
    if (query.deviceId) and.push({ deviceId: query.deviceId });
    if (query.dateFrom || query.dateTo) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (query.dateFrom) createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) createdAt.lte = new Date(query.dateTo);
      and.push({ createdAt });
    }

    if (and.length > 0) where.AND = and;
    return where;
  }

  private toBatchResponse(
    batch: {
      id: string;
      batchUid: string;
      status: SyncBatchStatus;
      totalItems: number;
      acceptedItems: number;
      rejectedItems: number;
      conflictItems: number;
      startedAt: Date | null;
      completedAt: Date | null;
    },
    items: Array<{
      localId: string;
      itemType: string;
      idempotencyKey: string;
      status: SyncItemStatus;
      errorMessage: string | null;
      linkedPaymentId: string | null;
      processedAt: Date | null;
    }>,
    alreadyProcessed: boolean,
  ): SyncBatchResponseDto {
    return {
      batchId: batch.id,
      batchUid: batch.batchUid,
      status: batch.status,
      alreadyProcessed,
      totalItems: batch.totalItems,
      acceptedItems: batch.acceptedItems,
      rejectedItems: batch.rejectedItems,
      conflictItems: batch.conflictItems,
      startedAt: batch.startedAt ?? null,
      completedAt: batch.completedAt ?? null,
      items: items.map((i) => ({
        localId: i.localId,
        itemType: i.itemType,
        idempotencyKey: i.idempotencyKey,
        status: i.status,
        errorMessage: i.errorMessage ?? null,
        linkedPaymentId: i.linkedPaymentId ?? null,
        processedAt: i.processedAt ?? null,
      })),
    };
  }
}
