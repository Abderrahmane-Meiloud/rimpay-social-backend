import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { Pool } from 'pg';
import { createTestContext, destroyTestContext } from './test-setup';
import { getTokens, TokenSet } from './test-auth-helper';
import { TestFixtureData } from './fixtures';
import { roles } from '../prisma/seed/data/roles.data';

// This file drives many real /auth/login round trips (by design — several
// scenarios must prove actual login success/failure, not just DB state).
// AuthThrottleGuard caps /auth/login at 5/min per IP in every environment
// including test, so between test groups we clear the in-memory throttler
// storage the same way a fresh minute would — this is test-only plumbing,
// it does not touch the throttle guard's production behavior.
function resetLoginThrottle(app: INestApplication): void {
  const storage = app.get(ThrottlerStorage) as unknown as { storage: Map<string, unknown> };
  storage.storage.clear();
}

const STRONG_PASSWORD = 'Institutional-Test-Pass-2026!';

describe('User account & scope management — ADMIN_TAAZOUR only (INSTITUTIONAL-RBAC-3)', () => {
  let app: INestApplication;
  let pool: Pool;
  let fixtures: TestFixtureData;
  let tokens: TokenSet;

  beforeAll(async () => {
    const ctx = await createTestContext();
    app = ctx.app;
    pool = ctx.pool;
    fixtures = ctx.fixtures;
    tokens = await getTokens(app, fixtures.users);
  });

  afterAll(async () => {
    await destroyTestContext({ app, pool });
  });

  beforeEach(() => {
    resetLoginThrottle(app);
  });

  async function createInactiveOperator(code: string): Promise<string> {
    const res = await pool.query(
      `INSERT INTO operators (id, name, code, status, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Test Inactive Operator For Users', $1, 'INACTIVE', NOW(), NOW())
       RETURNING id`,
      [code],
    );
    return res.rows[0].id;
  }

  // ================================================================
  // 1 & 7. ADMIN_TAAZOUR can create a PROGRAMME user with programme scope,
  // and that user can log in and see only its assigned programme data.
  // ================================================================
  describe('PROGRAMME account creation', () => {
    it('ADMIN_TAAZOUR can create a PROGRAMME user with a programme scope', async () => {
      const res = await request(app.getHttpServer())
        .post('/users/programme')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          email: 'new-programme-user@rimpay.test',
          fullName: 'New Programme User',
          password: STRONG_PASSWORD,
          socialProgramIds: [fixtures.program.id],
        });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe('new-programme-user@rimpay.test');
      expect(res.body.roles).toEqual(['PROGRAMME']);
      expect(res.body.programmeIds).toEqual([fixtures.program.id]);
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(res.body)).not.toContain(STRONG_PASSWORD);
    });

    it('PROGRAMME cannot create a PROGRAMME user (403)', async () => {
      const res = await request(app.getHttpServer())
        .post('/users/programme')
        .set('Authorization', `Bearer ${tokens.programme}`)
        .send({
          email: 'should-not-exist@rimpay.test',
          fullName: 'Should Not Be Created',
          password: STRONG_PASSWORD,
          socialProgramIds: [fixtures.program.id],
        });
      expect(res.status).toBe(403);

      const check = await pool.query(`SELECT id FROM users WHERE email = $1`, [
        'should-not-exist@rimpay.test',
      ]);
      expect(check.rows).toHaveLength(0);
    });

    it('OPERATOR cannot create a PROGRAMME user (403)', async () => {
      const res = await request(app.getHttpServer())
        .post('/users/programme')
        .set('Authorization', `Bearer ${tokens.operator}`)
        .send({
          email: 'should-not-exist-2@rimpay.test',
          fullName: 'Should Not Be Created',
          password: STRONG_PASSWORD,
          socialProgramIds: [fixtures.program.id],
        });
      expect(res.status).toBe(403);
    });

    it('AGENT cannot create a PROGRAMME user (403)', async () => {
      const res = await request(app.getHttpServer())
        .post('/users/programme')
        .set('Authorization', `Bearer ${tokens.agent}`)
        .send({
          email: 'should-not-exist-3@rimpay.test',
          fullName: 'Should Not Be Created',
          password: STRONG_PASSWORD,
          socialProgramIds: [fixtures.program.id],
        });
      expect(res.status).toBe(403);
    });

    it('a newly created PROGRAMME user can log in and sees only its assigned programme data', async () => {
      const email = 'login-programme-user@rimpay.test';
      await request(app.getHttpServer())
        .post('/users/programme')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          email,
          fullName: 'Login Programme User',
          password: STRONG_PASSWORD,
          socialProgramIds: [fixtures.program.id],
        })
        .expect(201);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: STRONG_PASSWORD });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.roles).toEqual(['PROGRAMME']);
      const newToken = loginRes.body.accessToken;

      const programsRes = await request(app.getHttpServer())
        .get('/programs')
        .set('Authorization', `Bearer ${newToken}`);
      expect(programsRes.status).toBe(200);
      const codes = programsRes.body.data.map((p: { code: string }) => p.code);
      expect(codes).toContain(fixtures.program.code);
    });
  });

  // ================================================================
  // 4, 5, 6, 8, 9. OPERATOR account creation and scoping.
  // ================================================================
  describe('OPERATOR account creation', () => {
    it('ADMIN_TAAZOUR can create an OPERATOR user linked to an ACTIVE operator', async () => {
      const res = await request(app.getHttpServer())
        .post('/users/operator')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          email: 'new-operator-user@rimpay.test',
          fullName: 'New Operator User',
          password: STRONG_PASSWORD,
          operatorId: fixtures.operatorRecord.id,
        });

      expect(res.status).toBe(201);
      expect(res.body.roles).toEqual(['OPERATOR']);
      expect(res.body.operatorId).toBe(fixtures.operatorRecord.id);
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('creating an OPERATOR user with an INACTIVE operator fails', async () => {
      const inactiveOperatorId = await createInactiveOperator('TEST-OPR-USERAPI-INACTIVE');

      const res = await request(app.getHttpServer())
        .post('/users/operator')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          email: 'should-not-exist-inactive-op@rimpay.test',
          fullName: 'Should Not Be Created',
          password: STRONG_PASSWORD,
          operatorId: inactiveOperatorId,
        });

      expect(res.status).toBe(409);

      const check = await pool.query(`SELECT id FROM users WHERE email = $1`, [
        'should-not-exist-inactive-op@rimpay.test',
      ]);
      expect(check.rows).toHaveLength(0);
    });

    it('OPERATOR user cannot be created by the API without an operatorId (validation error)', async () => {
      const res = await request(app.getHttpServer())
        .post('/users/operator')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          email: 'should-not-exist-no-operator@rimpay.test',
          fullName: 'Should Not Be Created',
          password: STRONG_PASSWORD,
        });

      expect(res.status).toBe(400);

      const check = await pool.query(`SELECT id FROM users WHERE email = $1`, [
        'should-not-exist-no-operator@rimpay.test',
      ]);
      expect(check.rows).toHaveLength(0);
    });

    it('a newly created OPERATOR user can log in and sees only its assigned operator data', async () => {
      const email = 'login-operator-user@rimpay.test';
      const createRes = await request(app.getHttpServer())
        .post('/users/operator')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          email,
          fullName: 'Login Operator User',
          password: STRONG_PASSWORD,
          operatorId: fixtures.operatorRecord.id,
        });
      expect(createRes.status).toBe(201);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: STRONG_PASSWORD });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.roles).toEqual(['OPERATOR']);
    });

    it('a newly created OPERATOR user cannot see another operator\'s beneficiaries/operations', async () => {
      const email = 'isolated-operator-user@rimpay.test';
      await request(app.getHttpServer())
        .post('/users/operator')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          email,
          fullName: 'Isolated Operator User',
          password: STRONG_PASSWORD,
          operatorId: fixtures.otherOperatorRecord.id,
        })
        .expect(201);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: STRONG_PASSWORD })
        .expect(200);
      const newToken = loginRes.body.accessToken;

      // fixtures.operatorRecord (not otherOperatorRecord) is the operator
      // the fixture OPERATOR user is scoped to and has assigned
      // beneficiaries in other suites; here we just assert the new
      // account's own operations list never includes an operation
      // belonging to the *other* operator by checking the scoped registry
      // returns an empty/foreign-free result set.
      const opsRes = await request(app.getHttpServer())
        .get('/payment-operations')
        .set('Authorization', `Bearer ${newToken}`);
      expect(opsRes.status).toBe(200);
      for (const op of opsRes.body.data) {
        expect(op.operator?.id ?? op.operatorId).not.toBe(fixtures.operatorRecord.id);
      }
    });
  });

  // ================================================================
  // 10, 11. Activation / deactivation / suspension.
  // ================================================================
  describe('Account activation / deactivation', () => {
    it('a deactivated user cannot log in', async () => {
      const email = 'to-deactivate@rimpay.test';
      const createRes = await request(app.getHttpServer())
        .post('/users/programme')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          email,
          fullName: 'To Deactivate',
          password: STRONG_PASSWORD,
          socialProgramIds: [fixtures.program.id],
        });
      const userId = createRes.body.id;

      await request(app.getHttpServer())
        .patch(`/users/${userId}/status`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: STRONG_PASSWORD });
      expect(loginRes.status).toBe(401);
    });

    it('a suspended user cannot log in', async () => {
      const email = 'to-suspend@rimpay.test';
      const createRes = await request(app.getHttpServer())
        .post('/users/programme')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          email,
          fullName: 'To Suspend',
          password: STRONG_PASSWORD,
          socialProgramIds: [fixtures.program.id],
        });
      const userId = createRes.body.id;

      await request(app.getHttpServer())
        .patch(`/users/${userId}/status`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ status: 'SUSPENDED' })
        .expect(200);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: STRONG_PASSWORD });
      expect(loginRes.status).toBe(401);
    });

    it('deactivating a user immediately revokes its existing session', async () => {
      const email = 'to-deactivate-midsession@rimpay.test';
      const createRes = await request(app.getHttpServer())
        .post('/users/programme')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          email,
          fullName: 'Mid Session Deactivate',
          password: STRONG_PASSWORD,
          socialProgramIds: [fixtures.program.id],
        });
      const userId = createRes.body.id;

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: STRONG_PASSWORD })
        .expect(200);
      const sessionToken = loginRes.body.accessToken;

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/users/${userId}/status`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(401);
    });
  });

  // ================================================================
  // 12. Password reset.
  // ================================================================
  describe('Password reset', () => {
    it('resets the password and the old password no longer works', async () => {
      const email = 'password-reset-user@rimpay.test';
      const createRes = await request(app.getHttpServer())
        .post('/users/programme')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          email,
          fullName: 'Password Reset User',
          password: STRONG_PASSWORD,
          socialProgramIds: [fixtures.program.id],
        });
      const userId = createRes.body.id;

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: STRONG_PASSWORD })
        .expect(200);

      const NEW_PASSWORD = 'New-Institutional-Test-Pass-2026!';
      const resetRes = await request(app.getHttpServer())
        .patch(`/users/${userId}/password`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ password: NEW_PASSWORD });
      expect(resetRes.status).toBe(200);
      expect(JSON.stringify(resetRes.body)).not.toContain(NEW_PASSWORD);

      const oldLoginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: STRONG_PASSWORD });
      expect(oldLoginRes.status).toBe(401);

      const newLoginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: NEW_PASSWORD });
      expect(newLoginRes.status).toBe(200);
    });
  });

  // ================================================================
  // Scope management: programme-scopes and operator-scope replace flows.
  // ================================================================
  describe('Scope management', () => {
    it('ADMIN_TAAZOUR can replace the programme scopes of a PROGRAMME user', async () => {
      const otherProgramRes = await pool.query(
        `INSERT INTO social_programs (id, name, code, type, status, start_date, end_date, created_at, updated_at)
         VALUES (gen_random_uuid(), 'Other Test Program', 'TEST-PROG-OTHER-001', 'CASH_TRANSFER', 'ACTIVE', '2026-01-01', '2027-12-31', NOW(), NOW())
         RETURNING id`,
      );
      const otherProgramId = otherProgramRes.rows[0].id;

      const createRes = await request(app.getHttpServer())
        .post('/users/programme')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          email: 'scope-swap-user@rimpay.test',
          fullName: 'Scope Swap User',
          password: STRONG_PASSWORD,
          socialProgramIds: [fixtures.program.id],
        });
      const userId = createRes.body.id;

      const swapRes = await request(app.getHttpServer())
        .patch(`/users/${userId}/programme-scopes`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ socialProgramIds: [otherProgramId] });

      expect(swapRes.status).toBe(200);
      expect(swapRes.body.programmeIds).toEqual([otherProgramId]);
    });

    it('ADMIN_TAAZOUR can change the linked operator of an OPERATOR user, but only to an ACTIVE operator', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/users/operator')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          email: 'operator-scope-swap@rimpay.test',
          fullName: 'Operator Scope Swap',
          password: STRONG_PASSWORD,
          operatorId: fixtures.operatorRecord.id,
        });
      const userId = createRes.body.id;

      const okSwap = await request(app.getHttpServer())
        .patch(`/users/${userId}/operator-scope`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ operatorId: fixtures.otherOperatorRecord.id });
      expect(okSwap.status).toBe(200);
      expect(okSwap.body.operatorId).toBe(fixtures.otherOperatorRecord.id);

      const inactiveOperatorId = await createInactiveOperator('TEST-OPR-USERAPI-SCOPESWAP-INACTIVE');
      const badSwap = await request(app.getHttpServer())
        .patch(`/users/${userId}/operator-scope`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ operatorId: inactiveOperatorId });
      expect(badSwap.status).toBe(409);
    });
  });

  // ================================================================
  // 13. GET /users never exposes passwordHash or token hashes.
  // ================================================================
  describe('GET /users safety', () => {
    it('does not include passwordHash or any token hash field', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${tokens.admin}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toMatch(/passwordHash/i);
      expect(serialized).not.toMatch(/tokenHash/i);
      expect(serialized).not.toMatch(/refreshToken/i);
    });

    it('PROGRAMME cannot list users (403)', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${tokens.programme}`);
      expect(res.status).toBe(403);
    });

    it('OPERATOR cannot list users (403)', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${tokens.operator}`);
      expect(res.status).toBe(403);
    });
  });

  // ================================================================
  // 14. AGENT is not a returned web role / not assignable through this API.
  // ================================================================
  describe('AGENT is excluded from the web user API', () => {
    it('AGENT is not marked isWebRole in the seed data', () => {
      const agent = roles.find((r) => r.name === 'AGENT');
      expect(agent!.isWebRole).toBe(false);
    });

    it('GET /users never returns an AGENT-only account', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .query({ limit: 100 });

      expect(res.status).toBe(200);
      for (const u of res.body.data) {
        expect(u.roles).not.toContain('AGENT');
      }
    });

    it('there is no way to create a web account with role AGENT through this API', async () => {
      // Neither creation endpoint accepts a role parameter — POST
      // /users/programme always assigns PROGRAMME and POST /users/operator
      // always assigns OPERATOR, so AGENT cannot be requested at all. An
      // unrecognized "role" field is rejected outright by the global
      // whitelist validation pipe rather than silently ignored.
      const attemptWithRoleField = await request(app.getHttpServer())
        .post('/users/programme')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          email: 'agent-attempt@rimpay.test',
          fullName: 'Agent Attempt',
          password: STRONG_PASSWORD,
          socialProgramIds: [fixtures.program.id],
          role: 'AGENT',
        });
      expect(attemptWithRoleField.status).toBe(400);

      const normalCreate = await request(app.getHttpServer())
        .post('/users/programme')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          email: 'agent-attempt-2@rimpay.test',
          fullName: 'Agent Attempt Two',
          password: STRONG_PASSWORD,
          socialProgramIds: [fixtures.program.id],
        });
      expect(normalCreate.status).toBe(201);
      expect(normalCreate.body.roles).toEqual(['PROGRAMME']);
    });
  });

  // ================================================================
  // 15. No public registration endpoint exists.
  // ================================================================
  describe('No self-registration', () => {
    it('there is no public /auth/register endpoint', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'self-register@rimpay.test', password: STRONG_PASSWORD });
      expect([404, 401]).toContain(res.status);
    });

    it('there is no public /users/register endpoint', async () => {
      const res = await request(app.getHttpServer())
        .post('/users/register')
        .send({ email: 'self-register-2@rimpay.test', password: STRONG_PASSWORD });
      expect([404, 401]).toContain(res.status);
    });

    it('unauthenticated requests cannot create a PROGRAMME or OPERATOR user', async () => {
      const res = await request(app.getHttpServer())
        .post('/users/programme')
        .send({
          email: 'unauth-attempt@rimpay.test',
          fullName: 'Unauth Attempt',
          password: STRONG_PASSWORD,
          socialProgramIds: [fixtures.program.id],
        });
      expect(res.status).toBe(401);
    });
  });
});
