import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditSource,
  Prisma,
  SocialProgramStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPaginatedResponse,
  PaginatedResponseDto,
} from '../common/dto/paginated-response.dto';
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { ProgramQueryDto } from './dto/program-query.dto';
import {
  ProgramDetailDto,
  ProgramListItemDto,
} from './dto/program-response.dto';
import {
  programListSelect,
  toProgramDetail,
  toProgramListItem,
} from './programs.mapper';

@Injectable()
export class ProgramsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: ProgramQueryDto,
  ): Promise<PaginatedResponseDto<ProgramListItemDto>> {
    const where = this.buildWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.socialProgram.findMany({
        where,
        select: programListSelect,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.socialProgram.count({ where }),
    ]);

    return buildPaginatedResponse(
      rows.map(toProgramListItem),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string): Promise<ProgramDetailDto> {
    const row = await this.prisma.socialProgram.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) {
      throw new NotFoundException('Program not found');
    }

    const summary = await this.getOperationsSummary(id);
    return toProgramDetail(row, summary.total, summary);
  }

  async create(
    dto: CreateProgramDto,
    currentUserId: string,
  ): Promise<ProgramDetailDto> {
    await this.assertCodeIsFree(dto.code);

    const created = await this.prisma.$transaction(async (tx) => {
      const program = await tx.socialProgram.create({
        data: {
          name: dto.name,
          code: dto.code,
          type: dto.type,
          institution: dto.institution,
          description: dto.description,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          budgetAmount: dto.budgetAmount ?? undefined,
          status: dto.status ?? SocialProgramStatus.DRAFT,
        },
      });

      await this.writeAudit(tx, currentUserId, 'program.create', program.id, {
        oldValues: Prisma.DbNull,
        newValues: this.programAuditSnapshot(program),
      });

      return program;
    });

    return this.findOne(created.id);
  }

  async update(
    id: string,
    dto: UpdateProgramDto,
    currentUserId: string,
  ): Promise<ProgramDetailDto> {
    const existing = await this.prisma.socialProgram.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Program not found');
    }

    const data: Prisma.SocialProgramUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.institution !== undefined) data.institution = dto.institution;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.startDate !== undefined)
      data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined)
      data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.budgetAmount !== undefined) data.budgetAmount = dto.budgetAmount;
    if (dto.status !== undefined) data.status = dto.status;

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.socialProgram.update({ where: { id }, data });

      await this.writeAudit(tx, currentUserId, 'program.update', id, {
        oldValues: this.programAuditSnapshot(existing),
        newValues: this.programAuditSnapshot(updated),
      });
    });

    return this.findOne(id);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildWhere(query: ProgramQueryDto): Prisma.SocialProgramWhereInput {
    const where: Prisma.SocialProgramWhereInput = { deletedAt: null };
    const and: Prisma.SocialProgramWhereInput[] = [];

    if (query.search) {
      and.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { code: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    if (query.code) and.push({ code: query.code });
    if (query.status) and.push({ status: query.status });
    if (query.type) and.push({ type: query.type });

    if (and.length > 0) where.AND = and;
    return where;
  }

  private async assertCodeIsFree(code: string): Promise<void> {
    const existing = await this.prisma.socialProgram.findUnique({
      where: { code },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('code already exists');
    }
  }

  private async getOperationsSummary(programId: string) {
    const grouped = await this.prisma.paymentOperation.groupBy({
      by: ['status'],
      where: { socialProgramId: programId, deletedAt: null },
      _count: { _all: true },
    });

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const g of grouped) {
      byStatus[g.status] = g._count._all;
      total += g._count._all;
    }
    return { total, byStatus };
  }

  private programAuditSnapshot(
    program: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    return {
      name: program.name as string,
      code: program.code as string,
      type: (program.type as string | null) ?? null,
      institution: (program.institution as string | null) ?? null,
      status: program.status as string,
      budgetAmount: program.budgetAmount
        ? String(program.budgetAmount)
        : null,
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
        entityType: 'SocialProgram',
        entityId,
        oldValues: values.oldValues,
        newValues: values.newValues,
        source: AuditSource.WEB,
      },
    });
  }
}
