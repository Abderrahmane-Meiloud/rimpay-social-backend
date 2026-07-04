import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPaginatedResponse,
  PaginatedResponseDto,
} from '../common/dto/paginated-response.dto';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import {
  AuditLogDetailDto,
  AuditLogListItemDto,
} from './dto/audit-log-response.dto';

const listSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  source: true,
  ipAddress: true,
  createdAt: true,
  user: {
    select: { id: true, fullName: true, email: true },
  },
};

const detailSelect = {
  ...listSelect,
  oldValues: true,
  newValues: true,
  deviceId: true,
};

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: AuditLogQueryDto,
  ): Promise<PaginatedResponseDto<AuditLogListItemDto>> {
    const where = this.buildWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        select: listSelect,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return buildPaginatedResponse(
      rows.map((r) => this.toListItem(r)),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string): Promise<AuditLogDetailDto> {
    const row = await this.prisma.auditLog.findUnique({
      where: { id },
      select: detailSelect,
    });
    if (!row) throw new NotFoundException('Audit log not found');

    return {
      ...this.toListItem(row),
      oldValues: row.oldValues,
      newValues: row.newValues,
      deviceId: row.deviceId ?? null,
    };
  }

  private toListItem(row: {
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    source: string;
    ipAddress: string | null;
    createdAt: Date;
    user: { id: string; fullName: string; email: string } | null;
  }): AuditLogListItemDto {
    return {
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId ?? null,
      source: row.source,
      actor: row.user
        ? { id: row.user.id, fullName: row.user.fullName, email: row.user.email }
        : null,
      ipAddress: row.ipAddress ?? null,
      createdAt: row.createdAt,
    };
  }

  private buildWhere(query: AuditLogQueryDto): Prisma.AuditLogWhereInput {
    const and: Prisma.AuditLogWhereInput[] = [];

    if (query.action) and.push({ action: { contains: query.action, mode: 'insensitive' } });
    if (query.entityType) and.push({ entityType: query.entityType });
    if (query.entityId) and.push({ entityId: query.entityId });
    if (query.userId) and.push({ userId: query.userId });

    if (query.dateFrom || query.dateTo) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (query.dateFrom) createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) createdAt.lte = new Date(query.dateTo);
      and.push({ createdAt });
    }

    return and.length > 0 ? { AND: and } : {};
  }
}
