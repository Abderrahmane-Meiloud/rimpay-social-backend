import { InclusionStatus, Prisma } from '../../generated/prisma/client';
import {
  BeneficiaryAssignmentSummaryDto,
  OperationDetailDto,
  OperationListItemDto,
  OperationScopeDto,
  PaymentSummaryDto,
  ScopeLevel,
} from './dto/payment-operation-response.dto';

const geoSelect = { id: true, name: true, code: true } as const;

export const operationListInclude = {
  socialProgram: { select: { id: true, name: true, code: true } },
  region: { select: geoSelect },
  moughataa: { select: geoSelect },
  commune: { select: geoSelect },
  locality: { select: geoSelect },
  _count: {
    select: {
      operationBeneficiaries: {
        where: { status: InclusionStatus.INCLUDED },
      },
    },
  },
} satisfies Prisma.PaymentOperationInclude;

export type OperationListRow = Prisma.PaymentOperationGetPayload<{
  include: typeof operationListInclude;
}>;

function buildScope(row: OperationListRow): OperationScopeDto {
  let level: ScopeLevel = 'NATIONAL';
  if (row.locality) level = 'LOCALITY';
  else if (row.commune) level = 'COMMUNE';
  else if (row.moughataa) level = 'MOUGHATAA';
  else if (row.region) level = 'REGION';

  return {
    level,
    region: row.region ?? null,
    moughataa: row.moughataa ?? null,
    commune: row.commune ?? null,
    locality: row.locality ?? null,
  };
}

// deletedAt is intentionally never mapped into any response.
export function toOperationListItem(
  row: OperationListRow,
): OperationListItemDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    period: row.period,
    plannedAmount: row.plannedAmount ? row.plannedAmount.toString() : null,
    paidAmount: row.paidAmount.toString(),
    executionRate: row.executionRate.toString(),
    socialProgram: row.socialProgram,
    scope: buildScope(row),
    assignedBeneficiariesCount: row._count.operationBeneficiaries,
    createdAt: row.createdAt,
  };
}

export function toOperationDetail(
  row: OperationListRow,
  beneficiaryAssignmentSummary: BeneficiaryAssignmentSummaryDto,
  paymentSummary: PaymentSummaryDto,
): OperationDetailDto {
  const base = toOperationListItem(row);
  return {
    ...base,
    startDate: row.startDate,
    endDate: row.endDate,
    updatedAt: row.updatedAt,
    beneficiaryAssignmentSummary,
    paymentSummary,
  };
}
