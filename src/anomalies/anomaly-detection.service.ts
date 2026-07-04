import { Injectable, Logger } from '@nestjs/common';
import {
  AnomalySeverity,
  AnomalyStatus,
  AnomalyType,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PrismaClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Beneficiary anomalies
  // ---------------------------------------------------------------------------

  async detectDuplicateNni(
    beneficiaryId: string,
    nni: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    try {
      const others = await db.beneficiary.count({
        where: { nni, deletedAt: null, id: { not: beneficiaryId } },
      });
      if (others === 0) return;

      await this.createIfNotExists(
        {
          type: AnomalyType.DUPLICATE_NNI,
          severity: AnomalySeverity.HIGH,
          entityType: 'Beneficiary',
          entityId: beneficiaryId,
          beneficiaryId,
          description: `NNI ${nni} is shared with ${others} other beneficiar${others === 1 ? 'y' : 'ies'}.`,
        },
        db,
      );
    } catch (err) {
      this.logger.error('detectDuplicateNni failed', err);
    }
  }

  async detectDuplicatePhone(
    beneficiaryId: string,
    phone: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    try {
      const others = await db.beneficiaryContact.count({
        where: {
          phone,
          beneficiary: { deletedAt: null, id: { not: beneficiaryId } },
        },
      });
      if (others === 0) return;

      await this.createIfNotExists(
        {
          type: AnomalyType.DUPLICATE_PHONE,
          severity: AnomalySeverity.MEDIUM,
          entityType: 'Beneficiary',
          entityId: beneficiaryId,
          beneficiaryId,
          description: `Phone ${phone} is shared with ${others} other beneficiar${others === 1 ? 'y' : 'ies'}.`,
        },
        db,
      );
    } catch (err) {
      this.logger.error('detectDuplicatePhone failed', err);
    }
  }

  async detectBeneficiaryModifiedAfterPayment(
    beneficiaryId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    try {
      const paidPayment = await db.payment.findFirst({
        where: { beneficiaryId, status: 'PAID' },
        select: { id: true, paidAt: true },
        orderBy: { paidAt: 'desc' },
      });
      if (!paidPayment) return;

      await this.createIfNotExists(
        {
          type: AnomalyType.BENEFICIARY_MODIFIED_AFTER_PAYMENT,
          severity: AnomalySeverity.HIGH,
          entityType: 'Beneficiary',
          entityId: beneficiaryId,
          beneficiaryId,
          description: `Beneficiary data was modified after payment ${paidPayment.id} was paid.`,
        },
        db,
      );
    } catch (err) {
      this.logger.error('detectBeneficiaryModifiedAfterPayment failed', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Payment anomalies
  // ---------------------------------------------------------------------------

  async detectMissingGps(
    paymentId: string,
    beneficiaryId: string | null,
    paymentOperationId: string | null,
    agentId: string | null,
    deviceId: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    try {
      await this.createIfNotExists(
        {
          type: AnomalyType.MISSING_GPS,
          severity: AnomalySeverity.LOW,
          entityType: 'Payment',
          entityId: paymentId,
          beneficiaryId: beneficiaryId ?? undefined,
          paymentId,
          paymentOperationId: paymentOperationId ?? undefined,
          agentId: agentId ?? undefined,
          deviceId: deviceId ?? undefined,
          description: `Payment ${paymentId} was validated without GPS coordinates.`,
        },
        db,
      );
    } catch (err) {
      this.logger.error('detectMissingGps failed', err);
    }
  }

  async detectPaymentAlreadyValidated(
    paymentId: string,
    beneficiaryId: string | null,
    paymentOperationId: string | null,
    agentId: string | null,
    deviceId: string | null,
    syncBatchId: string | null,
    syncItemId: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    try {
      await this.createIfNotExists(
        {
          type: AnomalyType.PAYMENT_ALREADY_VALIDATED,
          severity: AnomalySeverity.HIGH,
          entityType: 'Payment',
          entityId: paymentId,
          beneficiaryId: beneficiaryId ?? undefined,
          paymentId,
          paymentOperationId: paymentOperationId ?? undefined,
          agentId: agentId ?? undefined,
          deviceId: deviceId ?? undefined,
          syncBatchId: syncBatchId ?? undefined,
          syncItemId: syncItemId ?? undefined,
          description: `Payment ${paymentId} was already PAID when a second validation was attempted.`,
        },
        db,
      );
    } catch (err) {
      this.logger.error('detectPaymentAlreadyValidated failed', err);
    }
  }

  async detectMultiplePayment(
    beneficiaryId: string,
    paymentOperationId: string,
    existingPaymentId: string,
    newPaymentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    try {
      await this.createIfNotExists(
        {
          type: AnomalyType.MULTIPLE_PAYMENT,
          severity: AnomalySeverity.HIGH,
          entityType: 'Payment',
          entityId: newPaymentId,
          beneficiaryId,
          paymentId: newPaymentId,
          paymentOperationId,
          description: `Beneficiary ${beneficiaryId} already has payment ${existingPaymentId} in operation ${paymentOperationId}. Duplicate payment ${newPaymentId} detected.`,
        },
        db,
      );
    } catch (err) {
      this.logger.error('detectMultiplePayment failed', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Sync anomalies
  // ---------------------------------------------------------------------------

  async detectSyncConflict(
    paymentId: string,
    syncBatchId: string,
    syncItemId: string | null,
    agentId: string | null,
    deviceId: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    try {
      await this.createIfNotExists(
        {
          type: AnomalyType.SYNC_CONFLICT,
          severity: AnomalySeverity.MEDIUM,
          entityType: 'SyncBatch',
          entityId: syncBatchId,
          paymentId,
          agentId: agentId ?? undefined,
          deviceId: deviceId ?? undefined,
          syncBatchId,
          syncItemId: syncItemId ?? undefined,
          description: `Sync conflict: payment ${paymentId} was already PAID when sync batch ${syncBatchId} tried to validate it.`,
        },
        db,
      );
    } catch (err) {
      this.logger.error('detectSyncConflict failed', err);
    }
  }

  async detectAgentNotAssigned(
    agentId: string,
    paymentOperationId: string,
    syncBatchId: string,
    syncItemId: string | null,
    deviceId: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    try {
      await this.createIfNotExists(
        {
          type: AnomalyType.AGENT_NOT_ASSIGNED,
          severity: AnomalySeverity.HIGH,
          entityType: 'Agent',
          entityId: agentId,
          agentId,
          paymentOperationId,
          deviceId: deviceId ?? undefined,
          syncBatchId,
          syncItemId: syncItemId ?? undefined,
          description: `Agent ${agentId} is not assigned to payment operation ${paymentOperationId}.`,
        },
        db,
      );
    } catch (err) {
      this.logger.error('detectAgentNotAssigned failed', err);
    }
  }

  async detectUnknownDevice(
    deviceId: string,
    agentId: string | null,
    syncBatchId: string | null,
    syncItemId: string | null,
    deviceExists: boolean,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    try {
      await this.createIfNotExists(
        {
          type: AnomalyType.UNKNOWN_DEVICE,
          severity: AnomalySeverity.HIGH,
          entityType: 'Device',
          entityId: deviceId,
          agentId: agentId ?? undefined,
          deviceId: deviceExists ? deviceId : undefined,
          syncBatchId: syncBatchId ?? undefined,
          syncItemId: syncItemId ?? undefined,
          description: `Unknown or inactive device ${deviceId} attempted to submit a sync batch.`,
        },
        db,
      );
    } catch (err) {
      this.logger.error('detectUnknownDevice failed', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Core deduplication + create
  // ---------------------------------------------------------------------------

  private async createIfNotExists(
    params: {
      type: AnomalyType;
      severity: AnomalySeverity;
      entityType: string;
      entityId?: string;
      beneficiaryId?: string;
      paymentId?: string;
      paymentOperationId?: string;
      agentId?: string;
      deviceId?: string;
      syncBatchId?: string;
      syncItemId?: string;
      description?: string;
    },
    db: PrismaClient,
  ): Promise<void> {
    const existing = await db.anomaly.findFirst({
      where: {
        type: params.type,
        status: { in: [AnomalyStatus.OPEN, AnomalyStatus.IN_REVIEW] },
        ...(params.paymentId
          ? { paymentId: params.paymentId }
          : params.beneficiaryId
            ? { beneficiaryId: params.beneficiaryId }
            : params.agentId
              ? { agentId: params.agentId }
              : params.entityId
                ? { entityId: params.entityId }
                : {}),
      },
      select: { id: true },
    });

    if (existing) return;

    await db.anomaly.create({
      data: {
        type: params.type,
        severity: params.severity,
        status: AnomalyStatus.OPEN,
        entityType: params.entityType,
        entityId: params.entityId,
        beneficiaryId: params.beneficiaryId,
        paymentId: params.paymentId,
        paymentOperationId: params.paymentOperationId,
        agentId: params.agentId,
        deviceId: params.deviceId,
        syncBatchId: params.syncBatchId,
        syncItemId: params.syncItemId,
        description: params.description,
      },
      select: { id: true },
    });
  }
}
