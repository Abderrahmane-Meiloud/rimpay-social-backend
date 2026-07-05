import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditSource, OperatorStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPaginatedResponse,
  PaginatedResponseDto,
} from '../common/dto/paginated-response.dto';
import { CreateOperatorDto } from './dto/create-operator.dto';
import { UpdateOperatorDto } from './dto/update-operator.dto';
import { UpdateOperatorStatusDto } from './dto/update-operator-status.dto';
import { OperatorQueryDto } from './dto/operator-query.dto';
import {
  OperatorDetailDto,
  OperatorListItemDto,
} from './dto/operator-response.dto';
import {
  operatorListSelect,
  toOperatorDetail,
  toOperatorListItem,
} from './operators.mapper';

@Injectable()
export class OperatorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: OperatorQueryDto,
  ): Promise<PaginatedResponseDto<OperatorListItemDto>> {
    const where = this.buildWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.operator.findMany({
        where,
        select: operatorListSelect,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.operator.count({ where }),
    ]);

    return buildPaginatedResponse(
      rows.map(toOperatorListItem),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string): Promise<OperatorDetailDto> {
    const row = await this.prisma.operator.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) {
      throw new NotFoundException('Operator not found');
    }

    const [agentsCount, paymentOperationsCount] = await Promise.all([
      this.prisma.agent.count({ where: { operatorId: id, deletedAt: null } }),
      this.prisma.paymentOperation.count({
        where: { operatorId: id, deletedAt: null },
      }),
    ]);

    return toOperatorDetail(row, agentsCount, paymentOperationsCount);
  }

  async create(
    dto: CreateOperatorDto,
    currentUserId: string,
  ): Promise<OperatorDetailDto> {
    await this.assertCodeIsFree(dto.code);

    const created = await this.prisma.$transaction(async (tx) => {
      const operator = await tx.operator.create({
        data: {
          name: dto.name,
          code: dto.code,
          type: dto.type,
          legalName: dto.legalName,
          contactName: dto.contactName,
          contactPhone: dto.contactPhone,
          contactEmail: dto.contactEmail,
          status: OperatorStatus.ACTIVE,
        },
      });

      await this.writeAudit(tx, currentUserId, 'operator.create', operator.id, {
        oldValues: Prisma.DbNull,
        newValues: this.operatorAuditSnapshot(operator),
      });

      return operator;
    });

    return this.findOne(created.id);
  }

  async update(
    id: string,
    dto: UpdateOperatorDto,
    currentUserId: string,
  ): Promise<OperatorDetailDto> {
    const existing = await this.prisma.operator.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Operator not found');
    }

    const data: Prisma.OperatorUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.legalName !== undefined) data.legalName = dto.legalName;
    if (dto.contactName !== undefined) data.contactName = dto.contactName;
    if (dto.contactPhone !== undefined) data.contactPhone = dto.contactPhone;
    if (dto.contactEmail !== undefined) data.contactEmail = dto.contactEmail;

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.operator.update({ where: { id }, data });

      await this.writeAudit(tx, currentUserId, 'operator.update', id, {
        oldValues: this.operatorAuditSnapshot(existing),
        newValues: this.operatorAuditSnapshot(updated),
      });
    });

    return this.findOne(id);
  }

  async updateStatus(
    id: string,
    dto: UpdateOperatorStatusDto,
    currentUserId: string,
  ): Promise<OperatorDetailDto> {
    const existing = await this.prisma.operator.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Operator not found');
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.operator.update({
        where: { id },
        data: { status: dto.status },
      });

      await this.writeAudit(tx, currentUserId, 'operator.update_status', id, {
        oldValues: { status: existing.status },
        newValues: { status: updated.status },
      });
    });

    return this.findOne(id);
  }

  // ---------------------------------------------------------------------------
  // Shared assertion, used by Agent/PaymentOperation integration.
  // ---------------------------------------------------------------------------

  async assertOperatorIsActive(operatorId: string): Promise<void> {
    const operator = await this.prisma.operator.findFirst({
      where: { id: operatorId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!operator) {
      throw new NotFoundException('Invalid operatorId: operator not found');
    }
    if (operator.status !== OperatorStatus.ACTIVE) {
      throw new ConflictException(
        `Cannot assign an operator with status ${operator.status}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildWhere(query: OperatorQueryDto): Prisma.OperatorWhereInput {
    const where: Prisma.OperatorWhereInput = { deletedAt: null };
    const and: Prisma.OperatorWhereInput[] = [];

    if (query.search) {
      and.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { code: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    if (query.status) and.push({ status: query.status });

    if (and.length > 0) where.AND = and;
    return where;
  }

  private async assertCodeIsFree(code: string): Promise<void> {
    const existing = await this.prisma.operator.findUnique({
      where: { code },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('code already exists');
    }
  }

  private operatorAuditSnapshot(
    operator: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    return {
      name: operator.name as string,
      code: operator.code as string,
      type: (operator.type as string | null) ?? null,
      status: operator.status as string,
    };
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
        entityType: 'Operator',
        entityId,
        oldValues: values.oldValues,
        newValues: values.newValues,
        source: AuditSource.WEB,
      },
    });
  }
}
