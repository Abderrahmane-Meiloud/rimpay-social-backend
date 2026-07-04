import type { Prisma } from '../../generated/prisma/client';
import {
  AnomalyDetailDto,
  AnomalySummaryDto,
} from './dto/anomaly-response.dto';

type AnomalyRow = Prisma.AnomalyGetPayload<{
  select: {
    id: true;
    type: true;
    severity: true;
    status: true;
    entityType: true;
    entityId: true;
    beneficiaryId: true;
    paymentId: true;
    paymentOperationId: true;
    agentId: true;
    deviceId: true;
    syncBatchId: true;
    description: true;
    detectedAt: true;
    resolvedAt: true;
    createdAt: true;
  };
}>;

type AnomalyDetailRow = Prisma.AnomalyGetPayload<{
  include: {
    beneficiary: { select: { id: true; fullName: true; registryCode: true } };
    payment: { select: { id: true; status: true; amount: true } };
    paymentOperation: { select: { id: true; name: true; status: true } };
    agent: {
      select: {
        id: true;
        status: true;
        user: { select: { fullName: true } };
      };
    };
    device: { select: { id: true; deviceUid: true; status: true } };
    syncBatch: { select: { id: true; batchUid: true; status: true } };
  };
}> & {
  syncItemId: string | null;
  resolutionNotes: string | null;
  resolvedBy: string | null;
  updatedAt: Date;
};

export const anomalyListSelect = {
  id: true,
  type: true,
  severity: true,
  status: true,
  entityType: true,
  entityId: true,
  beneficiaryId: true,
  paymentId: true,
  paymentOperationId: true,
  agentId: true,
  deviceId: true,
  syncBatchId: true,
  description: true,
  detectedAt: true,
  resolvedAt: true,
  createdAt: true,
} as const;

export const anomalyDetailInclude = {
  beneficiary: { select: { id: true, fullName: true, registryCode: true } },
  payment: { select: { id: true, status: true, amount: true } },
  paymentOperation: { select: { id: true, name: true, status: true } },
  agent: {
    select: {
      id: true,
      status: true,
      user: { select: { fullName: true } },
    },
  },
  device: { select: { id: true, deviceUid: true, status: true } },
  syncBatch: { select: { id: true, batchUid: true, status: true } },
} as const;

export function toAnomalySummary(row: AnomalyRow): AnomalySummaryDto {
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    status: row.status,
    entityType: row.entityType,
    entityId: row.entityId ?? null,
    beneficiaryId: row.beneficiaryId ?? null,
    paymentId: row.paymentId ?? null,
    paymentOperationId: row.paymentOperationId ?? null,
    agentId: row.agentId ?? null,
    deviceId: row.deviceId ?? null,
    syncBatchId: row.syncBatchId ?? null,
    description: row.description ?? null,
    detectedAt: row.detectedAt,
    resolvedAt: row.resolvedAt ?? null,
    createdAt: row.createdAt,
  };
}

export function toAnomalyDetail(row: AnomalyDetailRow): AnomalyDetailDto {
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    status: row.status,
    entityType: row.entityType,
    entityId: row.entityId ?? null,
    beneficiaryId: row.beneficiaryId ?? null,
    paymentId: row.paymentId ?? null,
    paymentOperationId: row.paymentOperationId ?? null,
    agentId: row.agentId ?? null,
    deviceId: row.deviceId ?? null,
    syncBatchId: row.syncBatchId ?? null,
    syncItemId: row.syncItemId ?? null,
    description: row.description ?? null,
    resolutionNotes: row.resolutionNotes ?? null,
    resolvedBy: row.resolvedBy ?? null,
    detectedAt: row.detectedAt,
    resolvedAt: row.resolvedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    beneficiary: row.beneficiary
      ? {
          id: row.beneficiary.id,
          fullName: row.beneficiary.fullName,
          registryCode: row.beneficiary.registryCode,
        }
      : null,
    payment: row.payment
      ? {
          id: row.payment.id,
          status: row.payment.status,
          amount: row.payment.amount ? Number(row.payment.amount) : null,
        }
      : null,
    paymentOperation: row.paymentOperation
      ? {
          id: row.paymentOperation.id,
          name: row.paymentOperation.name,
          status: row.paymentOperation.status,
        }
      : null,
    agent: row.agent
      ? {
          id: row.agent.id,
          fullName: row.agent.user?.fullName ?? '',
          status: row.agent.status,
        }
      : null,
    device: row.device
      ? {
          id: row.device.id,
          deviceUid: row.device.deviceUid,
          status: row.device.status,
        }
      : null,
    syncBatch: row.syncBatch
      ? {
          id: row.syncBatch.id,
          batchUid: row.syncBatch.batchUid,
          status: row.syncBatch.status,
        }
      : null,
  };
}
