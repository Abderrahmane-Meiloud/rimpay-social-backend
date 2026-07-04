import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'pg';
import { PrismaService } from '../src/prisma/prisma.service';
import { SessionService } from '../src/auth/session.service';
import { createTestContext, destroyTestContext } from './test-setup';
import { TestFixtureData } from './fixtures';

function extractCookie(
  res: request.Response,
  name: string,
): string | undefined {
  const headers = res.headers['set-cookie'];
  if (!headers) return undefined;
  const cookies = Array.isArray(headers) ? headers : [headers];
  for (const c of cookies) {
    if (c.startsWith(`${name}=`)) {
      return c.split(';')[0].split('=').slice(1).join('=');
    }
  }
  return undefined;
}

function buildCookie(name: string, value: string): string {
  return `${name}=${value}`;
}

describe('Session Security (P0)', () => {
  let app: INestApplication;
  let pool: Pool;
  let fixtures: TestFixtureData;
  let sessionService: SessionService;

  beforeAll(async () => {
    const ctx = await createTestContext();
    app = ctx.app;
    pool = ctx.pool;
    fixtures = ctx.fixtures;
    sessionService = app.get(SessionService);
  });

  afterAll(async () => {
    await destroyTestContext({ app, pool });
  });

  describe('Login and refresh cookie', () => {
    it('login returns access token and sets HttpOnly refresh cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: fixtures.users.admin.email,
          password: fixtures.users.admin.password,
        })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).not.toHaveProperty('refreshToken');

      const rid = extractCookie(res, 'rid');
      expect(rid).toBeDefined();
      expect(rid!.length).toBeGreaterThan(20);

      const setCookie = (
        Array.isArray(res.headers['set-cookie'])
          ? res.headers['set-cookie']
          : [res.headers['set-cookie']]
      ).find((c: string) => c.startsWith('rid='));
      expect(setCookie).toContain('HttpOnly');
    });

    it('refresh token never appears in JSON response body', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: fixtures.users.programManager.email,
          password: fixtures.users.programManager.password,
        })
        .expect(200);

      const body = JSON.stringify(res.body);
      const rid = extractCookie(res, 'rid');
      expect(body).not.toContain(rid);
    });
  });

  describe('Refresh rotation', () => {
    it('refresh rotates token and invalidates old one', async () => {
      const { rawRefreshToken: rid1 } =
        await sessionService.createSessionWithAudit(fixtures.users.admin.id, {});

      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', buildCookie('rid', rid1))
        .expect(200);

      expect(refreshRes.body).toHaveProperty('accessToken');
      const rid2 = extractCookie(refreshRes, 'rid')!;
      expect(rid2).not.toBe(rid1);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', buildCookie('rid', rid1))
        .expect(401);
    });
  });

  describe('Reuse detection', () => {
    it('reuse of old refresh token revokes entire session', async () => {
      const { rawRefreshToken: rid1 } =
        await sessionService.createSessionWithAudit(fixtures.users.admin.id, {});

      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', buildCookie('rid', rid1))
        .expect(200);

      const rid2 = extractCookie(refreshRes, 'rid')!;

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', buildCookie('rid', rid1))
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', buildCookie('rid', rid2))
        .expect(401);

      const auditRows = await pool.query(
        `SELECT action FROM audit_logs WHERE action = 'auth.refresh.reuse_detected' ORDER BY created_at DESC LIMIT 1`,
      );
      expect(auditRows.rows.length).toBeGreaterThan(0);
    });
  });

  describe('Concurrent refresh (10 repetitions with DB invariants)', () => {
    it('each repetition: exactly one success, one reuse, DB invariants hold', async () => {
      for (let run = 0; run < 10; run++) {
        const { sessionId, rawRefreshToken: rid } =
          await sessionService.createSessionWithAudit(fixtures.users.admin.id, {});

        const [r1, r2] = await Promise.allSettled([
          sessionService.rotateRefreshToken(rid),
          sessionService.rotateRefreshToken(rid),
        ]);

        const results = [r1, r2]
          .filter((r): r is PromiseFulfilledResult<unknown> => r.status === 'fulfilled')
          .map((r) => r.value);

        const successes = results.filter((r) => r !== null);
        const failures = results.filter((r) => r === null);
        expect(successes.length).toBe(1);
        expect(failures.length).toBe(1);

        const usedTokens = await pool.query(
          `SELECT id FROM refresh_tokens WHERE session_id = $1 AND used_at IS NOT NULL`,
          [sessionId],
        );
        expect(usedTokens.rows.length).toBe(1);

        const session = await pool.query(
          `SELECT revoked_at FROM auth_sessions WHERE id = $1`,
          [sessionId],
        );
        expect(session.rows[0].revoked_at).not.toBeNull();

        const activeTokens = await pool.query(
          `SELECT id FROM refresh_tokens WHERE session_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
          [sessionId],
        );
        expect(activeTokens.rows.length).toBe(0);
      }
    });
  });

  describe('Logout', () => {
    it('logout revokes the current session', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: fixtures.users.supervisor.email,
          password: fixtures.users.supervisor.password,
        })
        .expect(200);

      const accessToken = loginRes.body.accessToken;
      const rid = extractCookie(loginRes, 'rid')!;

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', buildCookie('rid', rid))
        .expect(401);
    });
  });

  describe('Session and auth version enforcement', () => {
    it('access token with revoked session is rejected', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: fixtures.users.agent.email,
          password: fixtures.users.agent.password,
        })
        .expect(200);

      const accessToken = loginRes.body.accessToken;

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });

    it('access token with wrong auth version is rejected', async () => {
      const { sessionId } =
        await sessionService.createSessionWithAudit(fixtures.users.supervisor.id, {});
      const jwtService = app.get(JwtService);
      const token = await jwtService.signAsync({
        sub: fixtures.users.supervisor.id,
        email: fixtures.users.supervisor.email,
        roles: ['SUPERVISOR'],
        sid: sessionId,
        av: 999,
      });

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('inactive user is rejected even with unexpired JWT', async () => {
      const { sessionId } =
        await sessionService.createSessionWithAudit(fixtures.users.auditor.id, {});
      const jwtService = app.get(JwtService);
      const token = await jwtService.signAsync({
        sub: fixtures.users.auditor.id,
        email: fixtures.users.auditor.email,
        roles: ['AUDITOR'],
        sid: sessionId,
        av: 0,
      });

      await pool.query(
        `UPDATE users SET status = 'INACTIVE' WHERE id = $1`,
        [fixtures.users.auditor.id],
      );

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      await pool.query(
        `UPDATE users SET status = 'ACTIVE' WHERE id = $1`,
        [fixtures.users.auditor.id],
      );
    });

    it('legacy JWT without sid is rejected', async () => {
      const jwtService = app.get(JwtService);
      const token = await jwtService.signAsync({
        sub: fixtures.users.admin.id,
        email: fixtures.users.admin.email,
        roles: ['ADMIN'],
        av: 0,
      });

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('legacy JWT without av is rejected', async () => {
      const jwtService = app.get(JwtService);
      const token = await jwtService.signAsync({
        sub: fixtures.users.admin.id,
        email: fixtures.users.admin.email,
        roles: ['ADMIN'],
        sid: 'fake-session-id',
      });

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('JWT for user A with session belonging to user B returns 401', async () => {
      const { sessionId: sessionB } =
        await sessionService.createSessionWithAudit(fixtures.users.auditor.id, {});
      const jwtService = app.get(JwtService);
      const token = await jwtService.signAsync({
        sub: fixtures.users.admin.id,
        email: fixtures.users.admin.email,
        roles: ['ADMIN'],
        sid: sessionB,
        av: 0,
      });

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });
  });

  describe('Inactive user refresh protection', () => {
    it('inactive user refresh is rejected, session revoked, audit created', async () => {
      const { sessionId, rawRefreshToken: rid } =
        await sessionService.createSessionWithAudit(fixtures.users.auditor.id, {});

      await pool.query(
        `UPDATE users SET status = 'INACTIVE' WHERE id = $1`,
        [fixtures.users.auditor.id],
      );

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', buildCookie('rid', rid))
        .expect(401);

      const session = await pool.query(
        `SELECT revoked_at, revoked_reason FROM auth_sessions WHERE id = $1`,
        [sessionId],
      );
      expect(session.rows[0].revoked_at).not.toBeNull();
      expect(session.rows[0].revoked_reason).toBe('user_inactive');

      const audit = await pool.query(
        `SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'auth.session.revoked' ORDER BY created_at DESC LIMIT 1`,
        [sessionId],
      );
      expect(audit.rows.length).toBe(1);

      await pool.query(
        `UPDATE users SET status = 'ACTIVE' WHERE id = $1`,
        [fixtures.users.auditor.id],
      );
    });
  });

  describe('Atomic user-status in CAS refresh claim', () => {
    it('CAS claim fails atomically when user is inactive — no replacement token created', async () => {
      const { sessionId, rawRefreshToken: rid } =
        await sessionService.createSessionWithAudit(fixtures.users.auditor.id, {});

      const tokensBefore = await pool.query(
        `SELECT count(*)::int AS c FROM refresh_tokens WHERE session_id = $1`,
        [sessionId],
      );

      await pool.query(
        `UPDATE users SET status = 'INACTIVE' WHERE id = $1`,
        [fixtures.users.auditor.id],
      );

      const result = await sessionService.rotateRefreshToken(rid);
      expect(result).toBeNull();

      const tokensAfter = await pool.query(
        `SELECT count(*)::int AS c FROM refresh_tokens WHERE session_id = $1`,
        [sessionId],
      );
      expect(tokensAfter.rows[0].c).toBe(tokensBefore.rows[0].c);

      const session = await pool.query(
        `SELECT revoked_at FROM auth_sessions WHERE id = $1`,
        [sessionId],
      );
      expect(session.rows[0].revoked_at).not.toBeNull();

      await pool.query(
        `UPDATE users SET status = 'ACTIVE' WHERE id = $1`,
        [fixtures.users.auditor.id],
      );
    });
  });

  describe('Audit rollback proof', () => {
    it('security mutation rolls back when audit creation fails', async () => {
      const { sessionId } =
        await sessionService.createSessionWithAudit(fixtures.users.admin.id, {});

      const sessionBefore = await pool.query(
        `SELECT revoked_at FROM auth_sessions WHERE id = $1`,
        [sessionId],
      );
      expect(sessionBefore.rows[0].revoked_at).toBeNull();

      const auditCountBefore = await pool.query(
        `SELECT count(*)::int AS c FROM audit_logs`,
      );

      const prisma = app.get(PrismaService);
      let threw = false;
      try {
        await prisma.$transaction(async (tx) => {
          await tx.authSession.update({
            where: { id: sessionId },
            data: { revokedAt: new Date(), revokedReason: 'test_rollback' },
          });
          await tx.refreshToken.updateMany({
            where: { sessionId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          throw new Error('Simulated audit failure');
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);

      const sessionAfter = await pool.query(
        `SELECT revoked_at FROM auth_sessions WHERE id = $1`,
        [sessionId],
      );
      expect(sessionAfter.rows[0].revoked_at).toBeNull();

      const auditCountAfter = await pool.query(
        `SELECT count(*)::int AS c FROM audit_logs`,
      );
      expect(auditCountAfter.rows[0].c).toBe(auditCountBefore.rows[0].c);
    });
  });

  describe('Real audit INSERT failure rollback proof (database trigger)', () => {
    const TRIGGER_FN = 'test_block_session_revoked_audit';
    const TRIGGER_NAME = 'test_block_session_revoked_audit_trigger';

    it('a real audit_logs INSERT failure rolls back revokeSession atomically', async () => {
      const { sessionId, rawRefreshToken } =
        await sessionService.createSessionWithAudit(fixtures.users.admin.id, {});

      await pool.query(`
        CREATE OR REPLACE FUNCTION ${TRIGGER_FN}() RETURNS TRIGGER AS $$
        BEGIN
          IF NEW.action = 'auth.session.revoked' THEN
            RAISE EXCEPTION 'test-injected audit insert failure for auth.session.revoked';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      await pool.query(`
        CREATE TRIGGER ${TRIGGER_NAME}
        BEFORE INSERT ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION ${TRIGGER_FN}();
      `);

      try {
        await expect(
          sessionService.revokeSession(sessionId, 'test_trigger_rollback'),
        ).rejects.toThrow();

        const session = await pool.query(
          `SELECT revoked_at FROM auth_sessions WHERE id = $1`,
          [sessionId],
        );
        expect(session.rows[0].revoked_at).toBeNull();

        const tokenHash = SessionService.hashToken(rawRefreshToken);
        const token = await pool.query(
          `SELECT revoked_at FROM refresh_tokens WHERE token_hash = $1`,
          [tokenHash],
        );
        expect(token.rows[0].revoked_at).toBeNull();

        const audit = await pool.query(
          `SELECT id FROM audit_logs WHERE entity_id = $1 AND action = 'auth.session.revoked'`,
          [sessionId],
        );
        expect(audit.rows.length).toBe(0);
      } finally {
        await pool.query(`DROP TRIGGER IF EXISTS ${TRIGGER_NAME} ON audit_logs`);
        await pool.query(`DROP FUNCTION IF EXISTS ${TRIGGER_FN}()`);
      }
    });
  });

  describe('Audit log safety', () => {
    it('audit logs do not contain raw tokens, hashes, passwords, JWTs, or cookies', async () => {
      const { rawRefreshToken: rid } =
        await sessionService.createSessionWithAudit(fixtures.users.admin.id, {});

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', buildCookie('rid', rid))
        .expect(200);

      const auditRows = await pool.query(
        `SELECT action, old_values, new_values FROM audit_logs WHERE action LIKE 'auth.%' ORDER BY created_at DESC LIMIT 30`,
      );

      const hashRows = await pool.query(
        `SELECT token_hash FROM refresh_tokens ORDER BY created_at DESC LIMIT 10`,
      );

      for (const row of auditRows.rows) {
        const combined = JSON.stringify(row);
        expect(combined).not.toContain(rid);
        expect(combined).not.toContain(fixtures.users.admin.password);
        for (const hashRow of hashRows.rows) {
          expect(combined).not.toContain(hashRow.token_hash);
        }
      }
    });
  });
});
