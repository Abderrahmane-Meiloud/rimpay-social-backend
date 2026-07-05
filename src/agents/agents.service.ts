import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgentStatus,
  AuditSource,
  GeoAssignmentStatus,
  OperationAgentStatus,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OperatorsService } from '../operators/operators.service';
import {
  buildPaginatedResponse,
  PaginatedResponseDto,
} from '../common/dto/paginated-response.dto';
import { AgentQueryDto } from './dto/agent-query.dto';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { CreateAgentGeographicAssignmentDto } from './dto/create-geographic-assignment.dto';
import { UpdateAgentGeographicAssignmentDto } from './dto/update-geographic-assignment.dto';
import {
  AgentDetailDto,
  AgentListItemDto,
  GeographicAssignmentDto,
  GeoLevel,
  OperationAssignmentSummaryDto,
} from './dto/agent-response.dto';
import {
  agentDetailInclude,
  agentListInclude,
  toAgentDetail,
  toAgentListItem,
} from './agents.mapper';

type GeoScope = {
  regionId?: string;
  moughataaId?: string;
  communeId?: string;
  localityId?: string;
};

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operatorsService: OperatorsService,
  ) {}

  async findAll(
    query: AgentQueryDto,
  ): Promise<PaginatedResponseDto<AgentListItemDto>> {
    const where = this.buildWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.agent.findMany({
        where,
        include: agentListInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.agent.count({ where }),
    ]);

    return buildPaginatedResponse(
      rows.map(toAgentListItem),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string): Promise<AgentDetailDto> {
    const row = await this.prisma.agent.findFirst({
      where: { id, deletedAt: null },
      include: agentDetailInclude,
    });
    if (!row) throw new NotFoundException('Agent not found');

    const summary = await this.getOperationAssignmentSummary(id);
    return toAgentDetail(row, summary);
  }

  async create(
    dto: CreateAgentDto,
    currentUserId: string,
  ): Promise<AgentDetailDto> {
    await this.assertUserExists(dto.userId);
    await this.assertUserNotAlreadyLinked(dto.userId);
    if (dto.employeeCode) {
      await this.assertEmployeeCodeFree(dto.employeeCode);
    }
    if (dto.operatorId) {
      await this.operatorsService.assertOperatorIsActive(dto.operatorId);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const agent = await tx.agent.create({
        data: {
          user: { connect: { id: dto.userId } },
          operator: dto.operatorId
            ? { connect: { id: dto.operatorId } }
            : undefined,
          phone: dto.phone ?? undefined,
          employeeCode: dto.employeeCode ?? undefined,
          status: AgentStatus.ACTIVE,
        },
        select: { id: true },
      });

      await this.writeAudit(tx, currentUserId, 'agent.create', 'Agent', agent.id, {
        oldValues: Prisma.DbNull,
        newValues: {
          userId: dto.userId,
          operatorId: dto.operatorId ?? null,
          phone: dto.phone ?? null,
          employeeCode: dto.employeeCode ?? null,
          status: AgentStatus.ACTIVE,
        },
      });

      return agent;
    });

    return this.findOne(created.id);
  }

  async update(
    id: string,
    dto: UpdateAgentDto,
    currentUserId: string,
  ): Promise<AgentDetailDto> {
    const existing = await this.prisma.agent.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        phone: true,
        employeeCode: true,
        status: true,
        operatorId: true,
      },
    });
    if (!existing) throw new NotFoundException('Agent not found');

    if (
      dto.employeeCode !== undefined &&
      dto.employeeCode !== existing.employeeCode
    ) {
      await this.assertEmployeeCodeFree(dto.employeeCode);
    }
    if (dto.operatorId !== undefined && dto.operatorId !== existing.operatorId) {
      await this.operatorsService.assertOperatorIsActive(dto.operatorId);
    }

    const data: Prisma.AgentUpdateInput = {};
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.employeeCode !== undefined) data.employeeCode = dto.employeeCode;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.operatorId !== undefined) {
      data.operator = { connect: { id: dto.operatorId } };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.agent.update({ where: { id }, data });

      await this.writeAudit(tx, currentUserId, 'agent.update', 'Agent', id, {
        oldValues: {
          phone: existing.phone,
          employeeCode: existing.employeeCode,
          status: existing.status,
          operatorId: existing.operatorId,
        },
        newValues: {
          phone: dto.phone ?? existing.phone,
          employeeCode: dto.employeeCode ?? existing.employeeCode,
          status: dto.status ?? existing.status,
          operatorId: dto.operatorId ?? existing.operatorId,
        },
      });
    });

    return this.findOne(id);
  }

  async createGeographicAssignment(
    agentId: string,
    dto: CreateAgentGeographicAssignmentDto,
    currentUserId: string,
  ): Promise<GeographicAssignmentDto> {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!agent) throw new NotFoundException('Agent not found');
    if (agent.status !== AgentStatus.ACTIVE) {
      throw new ConflictException(
        `Cannot assign geography to an agent with status ${agent.status}`,
      );
    }

    const scope = this.validateGeoScope(dto);
    await this.assertGeoEntityExists(scope);
    await this.assertNoDuplicateActiveGeoAssignment(agentId, scope);

    const created = await this.prisma.$transaction(async (tx) => {
      const assignment = await tx.agentGeographicAssignment.create({
        data: {
          agentId,
          regionId: scope.regionId ?? undefined,
          moughataaId: scope.moughataaId ?? undefined,
          communeId: scope.communeId ?? undefined,
          localityId: scope.localityId ?? undefined,
          status: GeoAssignmentStatus.ACTIVE,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        },
        include: {
          region: { select: { id: true, name: true, code: true } },
          moughataa: { select: { id: true, name: true, code: true } },
          commune: { select: { id: true, name: true, code: true } },
          locality: { select: { id: true, name: true, code: true } },
        },
      });

      await this.writeAudit(
        tx,
        currentUserId,
        'agent.assign_geography',
        'Agent',
        agentId,
        {
          oldValues: Prisma.DbNull,
          newValues: {
            assignmentId: assignment.id,
            regionId: scope.regionId ?? null,
            moughataaId: scope.moughataaId ?? null,
            communeId: scope.communeId ?? null,
            localityId: scope.localityId ?? null,
            status: GeoAssignmentStatus.ACTIVE,
          },
        },
      );

      return assignment;
    });

    return this.toGeoAssignmentDto(created);
  }

  async updateGeographicAssignment(
    agentId: string,
    assignmentId: string,
    dto: UpdateAgentGeographicAssignmentDto,
    currentUserId: string,
  ): Promise<GeographicAssignmentDto> {
    const existing = await this.prisma.agentGeographicAssignment.findFirst({
      where: { id: assignmentId, agentId },
    });
    if (!existing) {
      throw new NotFoundException(
        'Geographic assignment not found for this agent',
      );
    }

    const data: Prisma.AgentGeographicAssignmentUpdateInput = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.endsAt !== undefined)
      data.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.agentGeographicAssignment.update({
        where: { id: assignmentId },
        data,
        include: {
          region: { select: { id: true, name: true, code: true } },
          moughataa: { select: { id: true, name: true, code: true } },
          commune: { select: { id: true, name: true, code: true } },
          locality: { select: { id: true, name: true, code: true } },
        },
      });

      await this.writeAudit(
        tx,
        currentUserId,
        'agent.update_geography_assignment',
        'AgentGeographicAssignment',
        assignmentId,
        {
          oldValues: { status: existing.status, endsAt: existing.endsAt },
          newValues: {
            status: dto.status ?? existing.status,
            endsAt: dto.endsAt !== undefined
              ? (dto.endsAt ? new Date(dto.endsAt).toISOString() : null)
              : existing.endsAt,
          },
        },
      );

      return result;
    });

    return this.toGeoAssignmentDto(updated);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildWhere(query: AgentQueryDto): Prisma.AgentWhereInput {
    const where: Prisma.AgentWhereInput = { deletedAt: null };
    const and: Prisma.AgentWhereInput[] = [];

    if (query.search) {
      and.push({
        OR: [
          { employeeCode: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
          { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
          { user: { email: { contains: query.search, mode: 'insensitive' } } },
        ],
      });
    }

    if (query.status) and.push({ status: query.status });

    if (query.regionId) {
      and.push({
        agentGeographicAssignments: {
          some: { status: GeoAssignmentStatus.ACTIVE, regionId: query.regionId },
        },
      });
    }
    if (query.moughataaId) {
      and.push({
        agentGeographicAssignments: {
          some: { status: GeoAssignmentStatus.ACTIVE, moughataaId: query.moughataaId },
        },
      });
    }
    if (query.communeId) {
      and.push({
        agentGeographicAssignments: {
          some: { status: GeoAssignmentStatus.ACTIVE, communeId: query.communeId },
        },
      });
    }
    if (query.localityId) {
      and.push({
        agentGeographicAssignments: {
          some: { status: GeoAssignmentStatus.ACTIVE, localityId: query.localityId },
        },
      });
    }

    if (and.length > 0) where.AND = and;
    return where;
  }

  private validateGeoScope(scope: GeoScope): GeoScope {
    const provided = [
      scope.regionId,
      scope.moughataaId,
      scope.communeId,
      scope.localityId,
    ].filter((v) => v !== undefined && v !== null && v !== '');

    if (provided.length === 0) {
      throw new BadRequestException(
        'Exactly one of regionId/moughataaId/communeId/localityId must be provided',
      );
    }
    if (provided.length > 1) {
      throw new BadRequestException(
        'Exactly one of regionId/moughataaId/communeId/localityId must be provided, not multiple',
      );
    }

    return {
      regionId: scope.regionId,
      moughataaId: scope.moughataaId,
      communeId: scope.communeId,
      localityId: scope.localityId,
    };
  }

  private async assertGeoEntityExists(scope: GeoScope): Promise<void> {
    if (scope.regionId) {
      const r = await this.prisma.region.findUnique({
        where: { id: scope.regionId },
        select: { id: true },
      });
      if (!r) throw new BadRequestException('Invalid regionId');
    }
    if (scope.moughataaId) {
      const m = await this.prisma.moughataa.findUnique({
        where: { id: scope.moughataaId },
        select: { id: true },
      });
      if (!m) throw new BadRequestException('Invalid moughataaId');
    }
    if (scope.communeId) {
      const c = await this.prisma.commune.findUnique({
        where: { id: scope.communeId },
        select: { id: true },
      });
      if (!c) throw new BadRequestException('Invalid communeId');
    }
    if (scope.localityId) {
      const l = await this.prisma.locality.findUnique({
        where: { id: scope.localityId },
        select: { id: true },
      });
      if (!l) throw new BadRequestException('Invalid localityId');
    }
  }

  private async assertNoDuplicateActiveGeoAssignment(
    agentId: string,
    scope: GeoScope,
  ): Promise<void> {
    // Block only the same agent + same level + same geo entity while ACTIVE.
    const filter: Prisma.AgentGeographicAssignmentWhereInput = {
      agentId,
      status: GeoAssignmentStatus.ACTIVE,
    };

    if (scope.regionId) filter.regionId = scope.regionId;
    else if (scope.moughataaId) filter.moughataaId = scope.moughataaId;
    else if (scope.communeId) filter.communeId = scope.communeId;
    else if (scope.localityId) filter.localityId = scope.localityId;

    const dup = await this.prisma.agentGeographicAssignment.findFirst({
      where: filter,
      select: { id: true },
    });
    if (dup) {
      throw new ConflictException(
        'Agent already has an active assignment at this geographic scope',
      );
    }
  }

  private async assertUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new BadRequestException('Invalid userId: user not found');
  }

  private async assertUserNotAlreadyLinked(userId: string): Promise<void> {
    const existing = await this.prisma.agent.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'This user is already linked to an agent profile',
      );
    }
  }

  private async assertEmployeeCodeFree(code: string): Promise<void> {
    const existing = await this.prisma.agent.findFirst({
      where: { employeeCode: code, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('employeeCode already exists');
    }
  }

  private async getOperationAssignmentSummary(
    agentId: string,
  ): Promise<OperationAssignmentSummaryDto> {
    const grouped = await this.prisma.operationAgent.groupBy({
      by: ['status'],
      where: { agentId },
      _count: { _all: true },
    });

    const byStatus: Record<string, number> = {};
    let total = 0;
    let active = 0;
    for (const g of grouped) {
      byStatus[g.status] = g._count._all;
      total += g._count._all;
      if (g.status === OperationAgentStatus.ACTIVE) active = g._count._all;
    }
    return { total, active, byStatus };
  }

  private toGeoAssignmentDto(
    a: {
      id: string;
      status: GeoAssignmentStatus;
      startsAt: Date | null;
      endsAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      region: { id: string; name: string; code: string } | null;
      moughataa: { id: string; name: string; code: string } | null;
      commune: { id: string; name: string; code: string } | null;
      locality: { id: string; name: string; code: string } | null;
    },
  ): GeographicAssignmentDto {
    let level: GeoLevel = 'REGION';
    if (a.locality) level = 'LOCALITY';
    else if (a.commune) level = 'COMMUNE';
    else if (a.moughataa) level = 'MOUGHATAA';

    return {
      id: a.id,
      status: a.status,
      level,
      region: a.region,
      moughataa: a.moughataa,
      commune: a.commune,
      locality: a.locality,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    userId: string,
    action: string,
    entityType: string,
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
        entityType,
        entityId,
        oldValues: values.oldValues,
        newValues: values.newValues,
        source: AuditSource.WEB,
      },
    });
  }
}
