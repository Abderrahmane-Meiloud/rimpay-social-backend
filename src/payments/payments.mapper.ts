import { Prisma } from '../../generated/prisma/client';
import {
  PaymentDetailDto,
  PaymentListItemDto,
  PaymentValidationSummaryDto,
  PaymentAnomalySummaryDto,
} from './dto/payment-response.dto';

const geoSelect = { id: true, name: true, code: true } as const;

// List include: lean beneficiary (NO nni) + its locality, operation + program
// summaries. Kept narrow to avoid leaking PII in bulk listings.
export const paymentListInclude = {
  beneficiary: {
    select: {
      id: true,
      registryCode: true,
      fullName: true,
      locality: { select: geoSelect },
    },
  },
  paymentOperation: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      socialProgram: { select: { id: true, code: true, name: true } },
    },
  },
} satisfies Prisma.PaymentInclude;

export type PaymentListRow = Prisma.PaymentGetPayload<{
  include: typeof paymentListInclude;
}>;

// Detail include: full beneficiary geography hierarchy, richer operation /
// program summaries, and recent status history.
export const paymentDetailInclude = {
  beneficiary: {
    select: {
      id: true,
      registryCode: true,
      fullName: true,
      nni: true,
      status: true,
      locality: {
        include: {
          commune: {
            include: {
              moughataa: { include: { region: true } },
            },
          },
        },
      },
    },
  },
  paymentOperation: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      period: true,
      socialProgram: {
        select: { id: true, code: true, name: true, status: true },
      },
    },
  },
  statusHistory: { orderBy: { createdAt: 'desc' }, take: 10 },
} satisfies Prisma.PaymentInclude;

export type PaymentDetailRow = Prisma.PaymentGetPayload<{
  include: typeof paymentDetailInclude;
}>;

export function toPaymentListItem(row: PaymentListRow): PaymentListItemDto {
  const locality = row.beneficiary.locality;
  return {
    id: row.id,
    amount: row.amount.toString(),
    status: row.status,
    syncStatus: row.syncStatus,
    plannedAt: row.plannedAt,
    paidAt: row.paidAt,
    cancelledAt: row.cancelledAt,
    beneficiary: {
      id: row.beneficiary.id,
      registryCode: row.beneficiary.registryCode,
      fullName: row.beneficiary.fullName,
    },
    operation: {
      id: row.paymentOperation.id,
      code: row.paymentOperation.code,
      name: row.paymentOperation.name,
      status: row.paymentOperation.status,
    },
    socialProgram: {
      id: row.paymentOperation.socialProgram.id,
      code: row.paymentOperation.socialProgram.code,
      name: row.paymentOperation.socialProgram.name,
    },
    locality: { id: locality.id, name: locality.name, code: locality.code },
    createdAt: row.createdAt,
  };
}

export function toPaymentDetail(
  row: PaymentDetailRow,
  validationSummary: PaymentValidationSummaryDto,
  anomalySummary: PaymentAnomalySummaryDto,
): PaymentDetailDto {
  const locality = row.beneficiary.locality;
  const commune = locality.commune;
  const moughataa = commune.moughataa;
  const region = moughataa.region;

  return {
    id: row.id,
    amount: row.amount.toString(),
    status: row.status,
    syncStatus: row.syncStatus,
    plannedAt: row.plannedAt,
    paidAt: row.paidAt,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    beneficiary: {
      id: row.beneficiary.id,
      registryCode: row.beneficiary.registryCode,
      fullName: row.beneficiary.fullName,
      nni: row.beneficiary.nni,
      status: row.beneficiary.status,
    },
    geography: {
      region: { id: region.id, name: region.name, code: region.code },
      moughataa: {
        id: moughataa.id,
        name: moughataa.name,
        code: moughataa.code,
      },
      commune: { id: commune.id, name: commune.name, code: commune.code },
      locality: { id: locality.id, name: locality.name, code: locality.code },
    },
    operation: {
      id: row.paymentOperation.id,
      code: row.paymentOperation.code,
      name: row.paymentOperation.name,
      status: row.paymentOperation.status,
      period: row.paymentOperation.period,
    },
    socialProgram: {
      id: row.paymentOperation.socialProgram.id,
      code: row.paymentOperation.socialProgram.code,
      name: row.paymentOperation.socialProgram.name,
      status: row.paymentOperation.socialProgram.status,
    },
    recentStatusHistory: row.statusHistory.map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      reason: h.reason,
      changedBy: h.changedBy,
      createdAt: h.createdAt,
    })),
    validationSummary,
    anomalySummary,
  };
}
