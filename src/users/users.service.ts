import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  AuditSource,
  OperatorStatus,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../auth/session.service';
import {
  buildPaginatedResponse,
  PaginatedResponseDto,
} from '../common/dto/paginated-response.dto';
import { CreateProgrammeUserDto } from './dto/create-programme-user.dto';
import { CreateOperatorUserDto } from './dto/create-operator-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';
import { UpdateProgrammeScopesDto } from './dto/update-programme-scopes.dto';
import { UpdateOperatorScopeDto } from './dto/update-operator-scope.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserDetailDto, UserListItemDto } from './dto/user-response.dto';
import { userListSelect, toUserDetail, toUserListItem } from './users.mapper';

const BCRYPT_COST = 12;

const userWithRolesInclude = {
  userRoles: {
    include: {
      role: {
        include: {
          rolePermissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  },
  programmeScopes: { select: { socialProgramId: true } },
  operator: { select: { id: true, status: true } },
} as const;

export type UserWithRoles = NonNullable<
  Awaited<ReturnType<UsersService['findByEmailWithRoles']>>
>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
  ) {}

  findByEmailWithRoles(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: userWithRolesInclude,
    });
  }

  findByIdWithRoles(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: userWithRolesInclude,
    });
  }

  // ---------------------------------------------------------------------------
  // Admin user/account management (INSTITUTIONAL-RBAC-3). Every method here
  // is reached only through routes gated by users.read/users.create/
  // users.update, which only ADMIN_TAAZOUR holds — there is no
  // self-registration path anywhere in this service.
  // ---------------------------------------------------------------------------

  async findAll(
    query: UserQueryDto,
  ): Promise<PaginatedResponseDto<UserListItemDto>> {
    const where = await this.buildWebUserWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userListSelect,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return buildPaginatedResponse(
      rows.map(toUserListItem),
      total,
      query.page,
      query.limit,
    );
  }

  async findOneWebUser(id: string): Promise<UserDetailDto> {
    const row = await this.prisma.user.findFirst({
      where: { id, deletedAt: null, userRoles: { some: { role: { isWebRole: true } } } },
      select: userListSelect,
    });
    if (!row) {
      throw new NotFoundException('User not found');
    }
    return toUserDetail(row);
  }

  async createProgrammeUser(
    dto: CreateProgrammeUserDto,
    currentUserId: string,
  ): Promise<UserDetailDto> {
    await this.assertEmailIsFree(dto.email);
    await this.assertProgrammesExist(dto.socialProgramIds);
    const role = await this.getWebRoleOrThrow('PROGRAMME');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          fullName: dto.fullName,
          passwordHash,
          status: 'ACTIVE',
          userRoles: { create: { roleId: role.id } },
          programmeScopes: {
            create: dto.socialProgramIds.map((socialProgramId) => ({
              socialProgramId,
            })),
          },
        },
      });

      await this.writeAudit(tx, currentUserId, 'user.create_programme', user.id, {
        oldValues: Prisma.DbNull,
        newValues: {
          email: user.email,
          fullName: user.fullName,
          role: 'PROGRAMME',
          socialProgramIds: dto.socialProgramIds,
        },
      });

      return user;
    });

    return this.findOneWebUser(created.id);
  }

  async createOperatorUser(
    dto: CreateOperatorUserDto,
    currentUserId: string,
  ): Promise<UserDetailDto> {
    await this.assertEmailIsFree(dto.email);
    await this.assertOperatorIsActive(dto.operatorId);
    const role = await this.getWebRoleOrThrow('OPERATOR');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          fullName: dto.fullName,
          passwordHash,
          status: 'ACTIVE',
          operatorId: dto.operatorId,
          userRoles: { create: { roleId: role.id } },
        },
      });

      await this.writeAudit(tx, currentUserId, 'user.create_operator', user.id, {
        oldValues: Prisma.DbNull,
        newValues: {
          email: user.email,
          fullName: user.fullName,
          role: 'OPERATOR',
          operatorId: dto.operatorId,
        },
      });

      return user;
    });

    return this.findOneWebUser(created.id);
  }

  async updateStatus(
    id: string,
    dto: UpdateUserStatusDto,
    currentUserId: string,
  ): Promise<UserDetailDto> {
    const existing = await this.getWebUserOrThrow(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status: dto.status } });
      await this.writeAudit(tx, currentUserId, 'user.update_status', id, {
        oldValues: { status: existing.status },
        newValues: { status: dto.status },
      });
    });

    // Immediately revokes all sessions/refresh tokens for this account, in
    // addition to the per-request ACTIVE check already enforced by
    // JwtStrategy — belt-and-suspenders so a deactivated/suspended account
    // cannot keep using an already-issued access token past its (short) TTL
    // via silent refresh, nor any live session.
    await this.sessionService.incrementAuthVersionAndRevokeAll(
      id,
      `user.status_changed_to_${dto.status.toLowerCase()}`,
      currentUserId,
    );

    return this.findOneWebUser(id);
  }

  async updatePassword(
    id: string,
    dto: UpdateUserPasswordDto,
    currentUserId: string,
  ): Promise<{ message: string }> {
    await this.getWebUserOrThrow(id);

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash } });
      await this.writeAudit(tx, currentUserId, 'user.reset_password', id, {
        oldValues: Prisma.DbNull,
        newValues: Prisma.DbNull,
      });
    });

    // The old password (and every existing session) must stop working the
    // instant it is reset — never log or return the new plaintext value.
    await this.sessionService.incrementAuthVersionAndRevokeAll(
      id,
      'user.password_reset',
      currentUserId,
    );

    return { message: 'Password updated' };
  }

  async replaceProgrammeScopes(
    id: string,
    dto: UpdateProgrammeScopesDto,
    currentUserId: string,
  ): Promise<UserDetailDto> {
    const existing = await this.getWebUserOrThrow(id);
    if (!existing.roles.includes('PROGRAMME')) {
      throw new BadRequestException(
        'Programme scopes can only be set on a PROGRAMME account',
      );
    }
    await this.assertProgrammesExist(dto.socialProgramIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.userProgrammeScope.deleteMany({ where: { userId: id } });
      await tx.userProgrammeScope.createMany({
        data: dto.socialProgramIds.map((socialProgramId) => ({
          userId: id,
          socialProgramId,
        })),
      });
      await this.writeAudit(tx, currentUserId, 'user.update_programme_scopes', id, {
        oldValues: { socialProgramIds: existing.programmeIds },
        newValues: { socialProgramIds: dto.socialProgramIds },
      });
    });

    return this.findOneWebUser(id);
  }

  async setOperatorScope(
    id: string,
    dto: UpdateOperatorScopeDto,
    currentUserId: string,
  ): Promise<UserDetailDto> {
    const existing = await this.getWebUserOrThrow(id);
    if (!existing.roles.includes('OPERATOR')) {
      throw new BadRequestException(
        'An operator scope can only be set on an OPERATOR account',
      );
    }
    await this.assertOperatorIsActive(dto.operatorId);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { operatorId: dto.operatorId },
      });
      await this.writeAudit(tx, currentUserId, 'user.update_operator_scope', id, {
        oldValues: { operatorId: existing.operatorId },
        newValues: { operatorId: dto.operatorId },
      });
    });

    return this.findOneWebUser(id);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async buildWebUserWhere(
    query: UserQueryDto,
  ): Promise<Prisma.UserWhereInput> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      userRoles: { some: { role: { isWebRole: true } } },
    };
    const and: Prisma.UserWhereInput[] = [];

    if (query.search) {
      and.push({
        OR: [
          { email: { contains: query.search, mode: 'insensitive' } },
          { fullName: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    if (query.status) and.push({ status: query.status });
    if (query.role) {
      and.push({ userRoles: { some: { role: { name: query.role, isWebRole: true } } } });
    }

    if (and.length > 0) where.AND = and;
    return where;
  }

  private async getWebUserOrThrow(id: string): Promise<UserListItemDto> {
    const row = await this.prisma.user.findFirst({
      where: { id, deletedAt: null, userRoles: { some: { role: { isWebRole: true } } } },
      select: userListSelect,
    });
    if (!row) {
      throw new NotFoundException('User not found');
    }
    return toUserListItem(row);
  }

  private async assertEmailIsFree(email: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      // Deliberately generic: does not confirm which role/status the
      // existing account has, only that this email cannot be (re)used.
      throw new ConflictException('This email cannot be used for a new account');
    }
  }

  private async assertProgrammesExist(ids: string[]): Promise<void> {
    const found = await this.prisma.socialProgram.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    if (found.length !== new Set(ids).size) {
      throw new BadRequestException('One or more socialProgramIds do not exist');
    }
  }

  private async assertOperatorIsActive(operatorId: string): Promise<void> {
    const operator = await this.prisma.operator.findFirst({
      where: { id: operatorId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!operator) {
      throw new BadRequestException('Invalid operatorId: operator not found');
    }
    if (operator.status !== OperatorStatus.ACTIVE) {
      throw new ConflictException(
        `Cannot link an account to an operator with status ${operator.status}`,
      );
    }
  }

  private async getWebRoleOrThrow(name: 'PROGRAMME' | 'OPERATOR') {
    const role = await this.prisma.role.findFirst({
      where: { name, isWebRole: true },
      select: { id: true },
    });
    if (!role) {
      throw new BadRequestException(`Role ${name} is not configured`);
    }
    return role;
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
        entityType: 'User',
        entityId,
        oldValues: values.oldValues,
        newValues: values.newValues,
        source: AuditSource.WEB,
      },
    });
  }
}
