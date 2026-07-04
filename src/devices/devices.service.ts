import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgentStatus,
  AuditSource,
  DeviceStatus,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPaginatedResponse,
  PaginatedResponseDto,
} from '../common/dto/paginated-response.dto';
import { DeviceQueryDto } from './dto/device-query.dto';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { DeviceDetailDto, DeviceListItemDto } from './dto/device-response.dto';
import {
  deviceListInclude,
  toDeviceDetail,
  toDeviceListItem,
} from './devices.mapper';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: DeviceQueryDto,
  ): Promise<PaginatedResponseDto<DeviceListItemDto>> {
    const where = this.buildWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.device.findMany({
        where,
        include: deviceListInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.device.count({ where }),
    ]);

    return buildPaginatedResponse(
      rows.map(toDeviceListItem),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string): Promise<DeviceDetailDto> {
    const row = await this.prisma.device.findFirst({
      where: { id, deletedAt: null },
      include: deviceListInclude,
    });
    if (!row) throw new NotFoundException('Device not found');
    return toDeviceDetail(row);
  }

  async create(
    dto: CreateDeviceDto,
    currentUserId: string,
  ): Promise<DeviceDetailDto> {
    await this.assertAgentActiveAndExists(dto.agentId);
    await this.assertDeviceUidFree(dto.deviceUid);

    const created = await this.prisma.$transaction(async (tx) => {
      const device = await tx.device.create({
        data: {
          agentId: dto.agentId,
          deviceUid: dto.deviceUid,
          platform: dto.platform ?? undefined,
          model: dto.model ?? undefined,
          appVersion: dto.appVersion ?? undefined,
          status: DeviceStatus.ACTIVE,
        },
        select: { id: true },
      });

      await this.writeAudit(tx, currentUserId, 'device.create', device.id, {
        oldValues: Prisma.DbNull,
        newValues: {
          agentId: dto.agentId,
          deviceUid: dto.deviceUid,
          platform: dto.platform ?? null,
          model: dto.model ?? null,
          appVersion: dto.appVersion ?? null,
          status: DeviceStatus.ACTIVE,
        },
      });

      return device;
    });

    return this.findOne(created.id);
  }

  async update(
    id: string,
    dto: UpdateDeviceDto,
    currentUserId: string,
  ): Promise<DeviceDetailDto> {
    const existing = await this.prisma.device.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        agentId: true,
        status: true,
        platform: true,
        model: true,
        appVersion: true,
        lastSeenAt: true,
      },
    });
    if (!existing) throw new NotFoundException('Device not found');

    // BLOCKED -> ACTIVE is forbidden directly; must go through INACTIVE first.
    if (
      existing.status === DeviceStatus.BLOCKED &&
      dto.status === DeviceStatus.ACTIVE
    ) {
      throw new ConflictException(
        'Cannot transition a BLOCKED device directly to ACTIVE. Set it to INACTIVE first.',
      );
    }

    if (dto.agentId && dto.agentId !== existing.agentId) {
      await this.assertAgentActiveAndExists(dto.agentId);
    }

    const data: Prisma.DeviceUpdateInput = {};
    if (dto.agentId !== undefined) data.agent = { connect: { id: dto.agentId } };
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.platform !== undefined) data.platform = dto.platform;
    if (dto.model !== undefined) data.model = dto.model;
    if (dto.appVersion !== undefined) data.appVersion = dto.appVersion;
    if (dto.lastSeenAt !== undefined)
      data.lastSeenAt = dto.lastSeenAt ? new Date(dto.lastSeenAt) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.device.update({ where: { id }, data });

      await this.writeAudit(tx, currentUserId, 'device.update', id, {
        oldValues: {
          agentId: existing.agentId,
          status: existing.status,
          platform: existing.platform,
          model: existing.model,
          appVersion: existing.appVersion,
        },
        newValues: {
          agentId: dto.agentId ?? existing.agentId,
          status: dto.status ?? existing.status,
          platform: dto.platform ?? existing.platform,
          model: dto.model ?? existing.model,
          appVersion: dto.appVersion ?? existing.appVersion,
        },
      });
    });

    return this.findOne(id);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildWhere(query: DeviceQueryDto): Prisma.DeviceWhereInput {
    const where: Prisma.DeviceWhereInput = { deletedAt: null };
    const and: Prisma.DeviceWhereInput[] = [];

    if (query.search) {
      and.push({
        OR: [
          { deviceUid: { contains: query.search, mode: 'insensitive' } },
          { platform: { contains: query.search, mode: 'insensitive' } },
          { model: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    if (query.status) and.push({ status: query.status });
    if (query.agentId) and.push({ agentId: query.agentId });

    if (and.length > 0) where.AND = and;
    return where;
  }

  private async assertAgentActiveAndExists(agentId: string): Promise<void> {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!agent) {
      throw new BadRequestException('Invalid agentId: agent not found');
    }
    if (agent.status !== AgentStatus.ACTIVE) {
      throw new ConflictException(
        `Agent is not ACTIVE (status: ${agent.status})`,
      );
    }
  }

  private async assertDeviceUidFree(deviceUid: string): Promise<void> {
    const existing = await this.prisma.device.findFirst({
      where: { deviceUid, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('deviceUid already exists');
    }
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    userId: string,
    action: string,
    entityId: string,
    values: {
      oldValues: Prisma.InputJsonValue | typeof Prisma.DbNull;
      newValues: Prisma.InputJsonValue | typeof Prisma.DbNull;
    },
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        userId,
        action,
        entityType: 'Device',
        entityId,
        oldValues: values.oldValues,
        newValues: values.newValues,
        source: AuditSource.WEB,
      },
    });
  }
}
