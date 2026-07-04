import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatus } from '../../generated/prisma/client';

const REFRESH_TOKEN_BYTES = 32;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(private readonly prisma: PrismaService) {}

  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createSessionWithAudit(
    userId: string,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<{ sessionId: string; rawRefreshToken: string }> {
    const rawToken = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const tokenHash = SessionService.hashToken(rawToken);

    const session = await this.prisma.$transaction(async (tx) => {
      const s = await tx.authSession.create({
        data: {
          userId,
          userAgent: meta.userAgent ?? null,
          ipAddress: meta.ipAddress ?? null,
          refreshTokens: {
            create: {
              tokenHash,
              expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
            },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'auth.login.success',
          entityType: 'AuthSession',
          entityId: s.id,
          source: 'WEB',
        },
      });
      return s;
    });

    return { sessionId: session.id, rawRefreshToken: rawToken };
  }

  async rotateRefreshToken(rawToken: string): Promise<{
    sessionId: string;
    userId: string;
    newRawRefreshToken: string;
    authVersion: number;
  } | null> {
    const tokenHash = SessionService.hashToken(rawToken);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: {
          tokenHash,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
          session: {
            revokedAt: null,
            user: { status: UserStatus.ACTIVE },
          },
        },
        data: { usedAt: now },
      });

      if (claimed.count === 1) {
        const token = await tx.refreshToken.findUnique({
          where: { tokenHash },
          select: {
            sessionId: true,
            session: {
              select: {
                userId: true,
                user: { select: { status: true, authVersion: true } },
              },
            },
          },
        });

        if (!token || token.session.user.status !== UserStatus.ACTIVE) {
          if (token) {
            await tx.authSession.update({
              where: { id: token.sessionId },
              data: { revokedAt: now, revokedReason: 'user_inactive' },
            });
            await tx.refreshToken.updateMany({
              where: { sessionId: token.sessionId, revokedAt: null },
              data: { revokedAt: now },
            });
            await tx.auditLog.create({
              data: {
                action: 'auth.session.revoked',
                entityType: 'AuthSession',
                entityId: token.sessionId,
                newValues: { reason: 'user_inactive' },
                source: 'WEB',
              },
            });
          }
          return null;
        }

        const newRaw = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
        const newHash = SessionService.hashToken(newRaw);

        await tx.refreshToken.create({
          data: {
            sessionId: token.sessionId,
            tokenHash: newHash,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
          },
        });

        await tx.authSession.update({
          where: { id: token.sessionId },
          data: { lastUsedAt: now },
        });

        await tx.auditLog.create({
          data: {
            userId: token.session.userId,
            action: 'auth.refresh.success',
            entityType: 'AuthSession',
            entityId: token.sessionId,
            source: 'WEB',
          },
        });

        return {
          sessionId: token.sessionId,
          userId: token.session.userId,
          newRawRefreshToken: newRaw,
          authVersion: token.session.user.authVersion,
        };
      }

      const existing = await tx.refreshToken.findUnique({
        where: { tokenHash },
        select: {
          sessionId: true,
          usedAt: true,
          revokedAt: true,
          expiresAt: true,
          session: {
            select: {
              revokedAt: true,
              user: { select: { status: true } },
            },
          },
        },
      });

      if (!existing) return null;

      if (existing.usedAt || existing.revokedAt) {
        await tx.authSession.update({
          where: { id: existing.sessionId },
          data: { revokedAt: now, revokedReason: 'refresh_token_reuse' },
        });
        await tx.refreshToken.updateMany({
          where: { sessionId: existing.sessionId, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.auditLog.create({
          data: {
            action: 'auth.refresh.reuse_detected',
            entityType: 'AuthSession',
            entityId: existing.sessionId,
            newValues: { reason: 'refresh_token_reuse' },
            source: 'WEB',
          },
        });
        this.logger.warn(
          `Refresh token reuse detected for session ${existing.sessionId}`,
        );
        return null;
      }

      if (existing.session.user.status !== UserStatus.ACTIVE) {
        await tx.authSession.update({
          where: { id: existing.sessionId },
          data: { revokedAt: now, revokedReason: 'user_inactive' },
        });
        await tx.refreshToken.updateMany({
          where: { sessionId: existing.sessionId, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.auditLog.create({
          data: {
            action: 'auth.session.revoked',
            entityType: 'AuthSession',
            entityId: existing.sessionId,
            newValues: { reason: 'user_inactive' },
            source: 'WEB',
          },
        });
      }

      return null;
    });
  }

  async isSessionActive(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.prisma.authSession.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
    });
    return !!session;
  }

  async revokeSession(
    sessionId: string,
    reason: string,
    actorUserId?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.authSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date(), revokedReason: reason },
      });
      await tx.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          userId: actorUserId ?? null,
          action: 'auth.session.revoked',
          entityType: 'AuthSession',
          entityId: sessionId,
          newValues: { reason },
          source: 'WEB',
        },
      });
    });
  }

  async revokeAllUserSessions(
    userId: string,
    reason: string,
    actorUserId?: string,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const sessions = await tx.authSession.findMany({
        where: { userId, revokedAt: null },
        select: { id: true },
      });
      if (sessions.length === 0) return 0;

      for (const s of sessions) {
        await tx.authSession.update({
          where: { id: s.id },
          data: { revokedAt: new Date(), revokedReason: reason },
        });
        await tx.refreshToken.updateMany({
          where: { sessionId: s.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.auditLog.create({
        data: {
          userId: actorUserId ?? null,
          action: 'auth.sessions.revoked_all',
          entityType: 'User',
          entityId: userId,
          newValues: { reason, count: sessions.length },
          source: 'WEB',
        },
      });
      return sessions.length;
    });
  }

  async incrementAuthVersionAndRevokeAll(
    userId: string,
    reason: string,
    actorUserId?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { authVersion: { increment: 1 } },
      });
      const sessions = await tx.authSession.findMany({
        where: { userId, revokedAt: null },
        select: { id: true },
      });
      for (const s of sessions) {
        await tx.authSession.update({
          where: { id: s.id },
          data: { revokedAt: new Date(), revokedReason: reason },
        });
        await tx.refreshToken.updateMany({
          where: { sessionId: s.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      if (sessions.length > 0) {
        await tx.auditLog.create({
          data: {
            userId: actorUserId ?? null,
            action: 'auth.sessions.revoked_all',
            entityType: 'User',
            entityId: userId,
            newValues: { reason, count: sessions.length },
            source: 'WEB',
          },
        });
      }
    });
  }
}
