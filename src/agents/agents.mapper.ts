import { Prisma } from '../../generated/prisma/client';
import {
  AgentDetailDto,
  AgentListItemDto,
  GeographicAssignmentDto,
  GeoLevel,
  OperationAssignmentSummaryDto,
} from './dto/agent-response.dto';

const geoSelect = { id: true, name: true, code: true } as const;

export const agentListInclude = {
  user: { select: { id: true, fullName: true, email: true, status: true } },
  operator: { select: { id: true, name: true, code: true, status: true } },
  _count: { select: { devices: { where: { deletedAt: null } } } },
} satisfies Prisma.AgentInclude;

export type AgentListRow = Prisma.AgentGetPayload<{
  include: typeof agentListInclude;
}>;

export const agentDetailInclude = {
  user: { select: { id: true, fullName: true, email: true, status: true } },
  operator: { select: { id: true, name: true, code: true, status: true } },
  devices: {
    where: { deletedAt: null },
    select: {
      id: true,
      deviceUid: true,
      platform: true,
      model: true,
      status: true,
      lastSeenAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
  agentGeographicAssignments: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      region: { select: geoSelect },
      moughataa: { select: geoSelect },
      commune: { select: geoSelect },
      locality: { select: geoSelect },
    },
  },
} satisfies Prisma.AgentInclude;

export type AgentDetailRow = Prisma.AgentGetPayload<{
  include: typeof agentDetailInclude;
}>;

// deletedAt is intentionally never mapped into any response.
export function toAgentListItem(row: AgentListRow): AgentListItemDto {
  return {
    id: row.id,
    employeeCode: row.employeeCode,
    phone: row.phone,
    status: row.status,
    user: row.user ?? null,
    operator: row.operator ?? null,
    devicesCount: row._count.devices,
    createdAt: row.createdAt,
  };
}

function toGeoAssignment(
  a: AgentDetailRow['agentGeographicAssignments'][number],
): GeographicAssignmentDto {
  let level: GeoLevel = 'REGION';
  if (a.locality) level = 'LOCALITY';
  else if (a.commune) level = 'COMMUNE';
  else if (a.moughataa) level = 'MOUGHATAA';

  return {
    id: a.id,
    status: a.status,
    level,
    region: a.region ?? null,
    moughataa: a.moughataa ?? null,
    commune: a.commune ?? null,
    locality: a.locality ?? null,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

export function toAgentDetail(
  row: AgentDetailRow,
  operationAssignmentSummary: OperationAssignmentSummaryDto,
): AgentDetailDto {
  return {
    id: row.id,
    employeeCode: row.employeeCode,
    phone: row.phone,
    status: row.status,
    user: row.user ?? null,
    operator: row.operator ?? null,
    devicesCount: row.devices.length,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    devices: row.devices.map((d) => ({
      id: d.id,
      deviceUid: d.deviceUid,
      platform: d.platform,
      model: d.model,
      status: d.status,
      lastSeenAt: d.lastSeenAt,
    })),
    geographicAssignments: row.agentGeographicAssignments.map(toGeoAssignment),
    operationAssignmentSummary,
  };
}
