import { Prisma } from '../../generated/prisma/client';
import { DeviceDetailDto, DeviceListItemDto } from './dto/device-response.dto';

export const deviceListInclude = {
  agent: {
    select: {
      id: true,
      employeeCode: true,
      user: { select: { id: true, fullName: true } },
    },
  },
} satisfies Prisma.DeviceInclude;

export type DeviceListRow = Prisma.DeviceGetPayload<{
  include: typeof deviceListInclude;
}>;

// deletedAt is intentionally never mapped into any response.
export function toDeviceListItem(row: DeviceListRow): DeviceListItemDto {
  return {
    id: row.id,
    deviceUid: row.deviceUid,
    platform: row.platform,
    model: row.model,
    appVersion: row.appVersion,
    status: row.status,
    lastSeenAt: row.lastSeenAt,
    agent: {
      id: row.agent.id,
      employeeCode: row.agent.employeeCode,
      user: row.agent.user ?? null,
    },
    createdAt: row.createdAt,
  };
}

export function toDeviceDetail(row: DeviceListRow): DeviceDetailDto {
  return {
    ...toDeviceListItem(row),
    updatedAt: row.updatedAt,
  };
}
