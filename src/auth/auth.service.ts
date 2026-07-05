import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { OperatorStatus, UserStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService, UserWithRoles } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto, SafeUserDto } from './dto/auth-response.dto';
import { JwtPayload } from './types/jwt-payload.interface';
import { AuthenticatedUser } from './types/authenticated-user.interface';
import { SessionService } from './session.service';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials';

const DUMMY_PASSWORD_HASH =
  '$2b$12$CwTycUXWue0Thq9StjUM0uJ8u6gY8eqMqFL3R0r1PqZKqVVgYqkO6';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly sessionService: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  async login(
    loginDto: LoginDto,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<{ response: AuthResponseDto; rawRefreshToken: string }> {
    const user = await this.usersService.findByEmailWithRoles(loginDto.email);

    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      passwordHash,
    );

    const isOperatorValid = this.isOperatorScopeValid(user ?? null);

    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      !isPasswordValid ||
      !isOperatorValid
    ) {
      if (user) {
        await this.prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'auth.login.failed',
            entityType: 'User',
            entityId: user.id,
            source: 'WEB',
          },
        });
      }
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const { sessionId, rawRefreshToken } =
      await this.sessionService.createSessionWithAudit(user.id, meta);

    const { roles, permissions } = this.extractRolesAndPermissions(user);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles,
      sid: sessionId,
      av: user.authVersion,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      response: {
        accessToken,
        user: this.toSafeUser(user),
        roles,
        permissions,
      },
      rawRefreshToken,
    };
  }

  async refresh(
    rawRefreshToken: string,
  ): Promise<{ accessToken: string; newRawRefreshToken: string } | null> {
    const result =
      await this.sessionService.rotateRefreshToken(rawRefreshToken);

    if (!result) return null;

    const user = await this.usersService.findByIdWithRoles(result.userId);
    if (!user || user.status !== UserStatus.ACTIVE) return null;
    if (!this.isOperatorScopeValid(user)) return null;

    const { roles } = this.extractRolesAndPermissions(user);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles,
      sid: result.sessionId,
      av: result.authVersion,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return { accessToken, newRawRefreshToken: result.newRawRefreshToken };
  }

  async logout(sessionId: string, userId: string): Promise<void> {
    await this.sessionService.revokeSession(sessionId, 'user_logout', userId);
  }

  toSafeUser(user: UserWithRoles): SafeUserDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
    };
  }

  toAuthenticatedUser(
    user: UserWithRoles,
    sessionId: string,
  ): AuthenticatedUser {
    const { roles, permissions } = this.extractRolesAndPermissions(user);
    return {
      ...this.toSafeUser(user),
      roles,
      permissions,
      sessionId,
      operatorId: user.operatorId,
      programmeIds: user.programmeScopes.map((scope) => scope.socialProgramId),
    };
  }

  // An OPERATOR user is valid only if operatorId is set and the linked
  // Operator exists and is ACTIVE. Non-OPERATOR users are always valid
  // here (this check is specific to the OPERATOR role's institutional
  // scoping requirement). Applied both at login and per-request (see
  // JwtStrategy) so that an operator later set INACTIVE/SUSPENDED
  // immediately invalidates any already-issued session.
  isOperatorScopeValid(user: UserWithRoles | null): boolean {
    if (!user) return false;

    const roleNames = user.userRoles.map((userRole) => userRole.role.name);
    if (!roleNames.includes('OPERATOR')) {
      return true;
    }

    if (!user.operatorId || !user.operator) {
      return false;
    }

    return user.operator.status === OperatorStatus.ACTIVE;
  }

  extractRolesAndPermissions(user: UserWithRoles) {
    const roles = user.userRoles.map((userRole) => userRole.role.name);
    const permissions = Array.from(
      new Set(
        user.userRoles.flatMap((userRole) =>
          userRole.role.rolePermissions.map(
            (rolePermission) => rolePermission.permission.code,
          ),
        ),
      ),
    );

    return { roles, permissions };
  }
}
