import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AnomalyStatus, AuditSource, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPaginatedResponse,
  PaginatedResponseDto,
} from '../common/dto/paginated-response.dto';
import { AnomalyQueryDto } from './dto/anomaly-query.dto';
import { ResolveAnomalyDto } from './dto/resolve-anomaly.dto';
import { ReopenAnomalyDto } from './dto/reopen-anomaly.dto';
import { AnomalyDetailDto, AnomalySummaryDto } from './dto/anomaly-response.dto';
import {
  anomalyDetailInclude,
  anomalyListSelect,
  toAnomalyDetail,
  toAnomalySummary,
} from './anomalies.mapper';

@Injectable()
export class AnomaliesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: AnomalyQueryDto,
  ): Promise<PaginatedResponseDto<AnomalySummaryDto>> {
    const where = this.buildWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.anomaly.findMany({
        where,
        select: anomalyListSelect,
        orderBy: { detectedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.anomaly.count({ where }),
    ]);

    return buildPaginatedResponse(
      rows.map(toAnomalySummary),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string): Promise<AnomalyDetailDto> {
    const row = await this.prisma.anomaly.findUnique({
      where: { id },
      include: anomalyDetailInclude,
    });
    if (!row) throw new NotFoundException('Anomaly not found');
    return toAnomalyDetail(row as Parameters<typeof toAnomalyDetail>[0]);
  }

  async resolve(
    id: string,
    dto: ResolveAnomalyDto,
    currentUserId: string,
  ): Promise<AnomalyDetailDto> {
    const existing = await this.prisma.anomaly.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!existing) throw new NotFoundException('Anomaly not found');

    if (existing.status === AnomalyStatus.RESOLVED) {
      throw new ConflictException('Anomaly is already RESOLVED');
    }
    if (existing.status === AnomalyStatus.DISMISSED) {
      throw new ConflictException('Cannot resolve a DISMISSED anomaly');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.anomaly.update({
        where: { id },
        data: {
          status: AnomalyStatus.RESOLVED,
          resolutionNotes: dto.resolutionNotes,
          resolvedBy: currentUserId,
          resolvedAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: currentUserId,
          action: 'anomaly.resolve',
          entityType: 'Anomaly',
          entityId: id,
          oldValues: { status: existing.status },
          newValues: {
            status: AnomalyStatus.RESOLVED,
            resolvedBy: currentUserId,
            resolutionNotes: dto.resolutionNotes,
            resolvedAt: now.toISOString(),
          },
          source: AuditSource.WEB,
        },
      });
    });

    return this.findOne(id);
  }

  async reopen(
    id: string,
    dto: ReopenAnomalyDto,
    currentUserId: string,
  ): Promise<AnomalyDetailDto> {
    const existing = await this.prisma.anomaly.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!existing) throw new NotFoundException('Anomaly not found');

    if (existing.status === AnomalyStatus.OPEN) {
      throw new ConflictException('Anomaly is already OPEN');
    }
    if (existing.status === AnomalyStatus.IN_REVIEW) {
      throw new ConflictException('Anomaly is already IN_REVIEW');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.anomaly.update({
        where: { id },
        data: {
          status: AnomalyStatus.OPEN,
          // resolvedAt, resolvedBy, resolutionNotes are preserved as historical audit data
        },
      });

      await tx.auditLog.create({
        data: {
          userId: currentUserId,
          action: 'anomaly.reopen',
          entityType: 'Anomaly',
          entityId: id,
          oldValues: { status: existing.status },
          newValues: {
            status: AnomalyStatus.OPEN,
            reason: dto.reason,
          },
          source: AuditSource.WEB,
        },
      });
    });

    return this.findOne(id);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildWhere(query: AnomalyQueryDto): Prisma.AnomalyWhereInput {
    const where: Prisma.AnomalyWhereInput = {};
    const and: Prisma.AnomalyWhereInput[] = [];

    if (query.status) and.push({ status: query.status });
    if (query.type) and.push({ type: query.type });
    if (query.severity) and.push({ severity: query.severity });
    if (query.beneficiaryId) and.push({ beneficiaryId: query.beneficiaryId });
    if (query.paymentId) and.push({ paymentId: query.paymentId });
    if (query.paymentOperationId)
      and.push({ paymentOperationId: query.paymentOperationId });
    if (query.agentId) and.push({ agentId: query.agentId });
    if (query.deviceId) and.push({ deviceId: query.deviceId });
    if (query.syncBatchId) and.push({ syncBatchId: query.syncBatchId });
    if (query.entityType) and.push({ entityType: query.entityType });

    if (query.dateFrom || query.dateTo) {
      const detectedAt: Prisma.DateTimeFilter = {};
      if (query.dateFrom) detectedAt.gte = new Date(query.dateFrom);
      if (query.dateTo) detectedAt.lte = new Date(query.dateTo);
      and.push({ detectedAt });
    }

    if (and.length > 0) where.AND = and;
    return where;
  }
}
