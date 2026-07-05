import { Prisma } from '../../generated/prisma/client';
import {
  OperatorDetailDto,
  OperatorListItemDto,
} from './dto/operator-response.dto';

export const operatorListSelect = {
  id: true,
  code: true,
  name: true,
  type: true,
  status: true,
  createdAt: true,
  _count: {
    select: {
      agents: { where: { deletedAt: null } },
      paymentOperations: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.OperatorSelect;

export type OperatorListRow = Prisma.OperatorGetPayload<{
  select: typeof operatorListSelect;
}>;

// deletedAt is intentionally never mapped into any response.
export function toOperatorListItem(row: OperatorListRow): OperatorListItemDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    status: row.status,
    agentsCount: row._count.agents,
    paymentOperationsCount: row._count.paymentOperations,
    createdAt: row.createdAt,
  };
}

export function toOperatorDetail(
  row: Prisma.OperatorGetPayload<object>,
  agentsCount: number,
  paymentOperationsCount: number,
): OperatorDetailDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    status: row.status,
    agentsCount,
    paymentOperationsCount,
    legalName: row.legalName,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
