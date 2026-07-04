import { Prisma } from '../../generated/prisma/client';
import {
  OperationsStatusSummaryDto,
  ProgramDetailDto,
  ProgramListItemDto,
} from './dto/program-response.dto';

// List rows include a _count of operations.
export const programListSelect = {
  id: true,
  code: true,
  name: true,
  type: true,
  status: true,
  startDate: true,
  endDate: true,
  _count: { select: { paymentOperations: true } },
} satisfies Prisma.SocialProgramSelect;

export type ProgramListRow = Prisma.SocialProgramGetPayload<{
  select: typeof programListSelect;
}>;

// deletedAt is intentionally never mapped into any response.
export function toProgramListItem(row: ProgramListRow): ProgramListItemDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    operationsCount: row._count.paymentOperations,
  };
}

export function toProgramDetail(
  row: Prisma.SocialProgramGetPayload<object>,
  operationsCount: number,
  operationsSummary: OperationsStatusSummaryDto,
): ProgramDetailDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    operationsCount,
    institution: row.institution,
    description: row.description,
    budgetAmount: row.budgetAmount ? row.budgetAmount.toString() : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    operationsSummary,
  };
}
