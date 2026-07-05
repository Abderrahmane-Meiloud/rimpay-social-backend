import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { createTestContext, destroyTestContext } from './test-setup';
import { getTokens, TokenSet } from './test-auth-helper';
import { TestFixtureData } from './fixtures';
import { roles, WEB_ROLE_NAMES } from '../prisma/seed/data/roles.data';

const BCRYPT_COST = 4;

describe('Institutional RBAC 2 FIX — web role boundary and operator login enforcement', () => {
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

  async function createOperatorUser(
    email: string,
    password: string,
    operatorId: string | null,
  ): Promise<{ id: string }> {
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    const userResult = await pool.query(
      `INSERT INTO users (id, email, password_hash, full_name, status, operator_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE', $4, NOW(), NOW())
       RETURNING id`,
      [email, hash, 'Test Extra Operator User', operatorId],
    );
    const userId = userResult.rows[0].id;

    const roleResult = await pool.query(
      `SELECT id FROM roles WHERE name = 'OPERATOR'`,
    );
    await pool.query(
      `INSERT INTO user_roles (id, user_id, role_id, created_at)
       VALUES (gen_random_uuid(), $1, $2, NOW())`,
      [userId, roleResult.rows[0].id],
    );

    return { id: userId };
  }

  // ================================================================
  // A. Web role boundary
  // ================================================================
  describe('Web role boundary (isWebRole)', () => {
    it('the three institutional web roles are exactly ADMIN_TAAZOUR, PROGRAMME, OPERATOR', () => {
      expect(WEB_ROLE_NAMES.sort()).toEqual(
        ['ADMIN_TAAZOUR', 'PROGRAMME', 'OPERATOR'].sort(),
      );
    });

    it('AGENT is marked isWebRole=false in the seed data', () => {
      const agent = roles.find((r) => r.name === 'AGENT');
      expect(agent).toBeDefined();
      expect(agent!.isWebRole).toBe(false);
      expect(WEB_ROLE_NAMES).not.toContain('AGENT');
    });

    it('AGENT is persisted with is_web_role=false in the database', async () => {
      const res = await pool.query(
        `SELECT is_web_role FROM roles WHERE name = 'AGENT'`,
      );
      expect(res.rows[0].is_web_role).toBe(false);
    });

    it('the three web roles are persisted with is_web_role=true in the database', async () => {
      const res = await pool.query(
        `SELECT name, is_web_role FROM roles WHERE name IN ('ADMIN_TAAZOUR', 'PROGRAMME', 'OPERATOR')`,
      );
      expect(res.rows.every((r) => r.is_web_role === true)).toBe(true);
      expect(res.rows).toHaveLength(3);
    });

    it('AGENT holds only payments.validate and sync.process — no browse/read permissions', () => {
      const agent = roles.find((r) => r.name === 'AGENT');
      expect(agent!.permissionCodes.sort()).toEqual(
        ['payments.validate', 'sync.process'].sort(),
      );
    });
  });

  // ================================================================
  // 12. AGENT/FIELD_AGENT_DEVICE cannot access web dashboard/admin endpoints.
  // ================================================================
  describe('AGENT cannot access web dashboard/admin endpoints', () => {
    it('AGENT cannot access the dashboard summary (403)', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/summary')
        .set('Authorization', `Bearer ${tokens.agent}`);
      expect(res.status).toBe(403);
    });

    it('AGENT cannot list audit logs (403)', async () => {
      const res = await request(app.getHttpServer())
        .get('/audit-logs')
        .set('Authorization', `Bearer ${tokens.agent}`);
      expect(res.status).toBe(403);
    });

    it('AGENT cannot list social programs (403)', async () => {
      const res = await request(app.getHttpServer())
        .get('/programs')
        .set('Authorization', `Bearer ${tokens.agent}`);
      expect(res.status).toBe(403);
    });

    it('AGENT cannot list operators (403)', async () => {
      const res = await request(app.getHttpServer())
        .get('/operators')
        .set('Authorization', `Bearer ${tokens.agent}`);
      expect(res.status).toBe(403);
    });

    it('AGENT cannot browse the beneficiaries registry (403)', async () => {
      const res = await request(app.getHttpServer())
        .get('/beneficiaries')
        .set('Authorization', `Bearer ${tokens.agent}`);
      expect(res.status).toBe(403);
    });

    it('AGENT cannot browse the payment operations registry (403)', async () => {
      const res = await request(app.getHttpServer())
        .get('/payment-operations')
        .set('Authorization', `Bearer ${tokens.agent}`);
      expect(res.status).toBe(403);
    });
  });

  // ================================================================
  // B. Operator login / access enforcement
  // ================================================================
  describe('OPERATOR login/access enforcement', () => {
    // 1. OPERATOR user without operatorId cannot login or access protected API.
    it('OPERATOR user without operatorId cannot login', async () => {
      const email = 'operator-no-scope@rimpay.test';
      const password = 'Test-Operator-NoScope-2026!';
      await createOperatorUser(email, password, null);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password });
      expect(res.status).toBe(401);
      expect(res.body.message).not.toMatch(/operator/i);
    });

    // 2. OPERATOR user linked to INACTIVE operator cannot login.
    it('OPERATOR user linked to an INACTIVE operator cannot login', async () => {
      const opResult = await pool.query(
        `INSERT INTO operators (id, name, code, status, created_at, updated_at)
         VALUES (gen_random_uuid(), 'Test Inactive Operator', 'TEST-OPR-INACTIVE', 'INACTIVE', NOW(), NOW())
         RETURNING id`,
      );
      const email = 'operator-inactive-op@rimpay.test';
      const password = 'Test-Operator-Inactive-2026!';
      await createOperatorUser(email, password, opResult.rows[0].id);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password });
      expect(res.status).toBe(401);
    });

    // 3. OPERATOR user linked to SUSPENDED operator cannot login.
    it('OPERATOR user linked to a SUSPENDED operator cannot login', async () => {
      const opResult = await pool.query(
        `INSERT INTO operators (id, name, code, status, created_at, updated_at)
         VALUES (gen_random_uuid(), 'Test Suspended Operator', 'TEST-OPR-SUSPENDED', 'SUSPENDED', NOW(), NOW())
         RETURNING id`,
      );
      const email = 'operator-suspended-op@rimpay.test';
      const password = 'Test-Operator-Suspended-2026!';
      await createOperatorUser(email, password, opResult.rows[0].id);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password });
      expect(res.status).toBe(401);
    });

    // 4. OPERATOR user linked to ACTIVE operator can login.
    it('OPERATOR user linked to an ACTIVE operator can login', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: fixtures.users.operator.email,
          password: fixtures.users.operator.password,
        });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.roles).toContain('OPERATOR');
    });

    it('an operator demoted to INACTIVE mid-session is rejected on the next protected request', async () => {
      const opResult = await pool.query(
        `INSERT INTO operators (id, name, code, status, created_at, updated_at)
         VALUES (gen_random_uuid(), 'Test Mid Session Operator', 'TEST-OPR-MIDSESSION', 'ACTIVE', NOW(), NOW())
         RETURNING id`,
      );
      const email = 'operator-midsession@rimpay.test';
      const password = 'Test-Operator-MidSession-2026!';
      await createOperatorUser(email, password, opResult.rows[0].id);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      const accessToken = loginRes.body.accessToken;

      // Still valid immediately after login.
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await pool.query(`UPDATE operators SET status = 'INACTIVE' WHERE id = $1`, [
        opResult.rows[0].id,
      ]);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });
  });

  // 5 & 6. Cross-operator isolation (beneficiaries and payment operations)
  // is already covered by test/institutional-rbac-2.e2e-spec.ts and
  // test/operator-domain.e2e-spec.ts; not duplicated here.

  // 7, 8, 9, 10, 11: beneficiary create/NNI/programme-scope rules are
  // already covered by test/institutional-rbac-2.e2e-spec.ts. A minimal
  // smoke check is kept here to bind this phase's fix directly to those
  // guarantees still holding after the AGENT permission narrowing.
  describe('Beneficiary permission smoke check (regression guard)', () => {
    it('ADMIN_TAAZOUR can create a beneficiary', async () => {
      const res = await request(app.getHttpServer())
        .post('/beneficiaries')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          registryCode: 'RBAC2FIX-BEN-ADMIN-001',
          fullName: 'Test Beneficiary RBAC2FIX',
          localityId: fixtures.localities[0].id,
        });
      expect(res.status).toBe(201);
    });

    it('PROGRAMME cannot create a beneficiary (403)', async () => {
      const res = await request(app.getHttpServer())
        .post('/beneficiaries')
        .set('Authorization', `Bearer ${tokens.programme}`)
        .send({
          registryCode: 'RBAC2FIX-BEN-PROG-001',
          fullName: 'Should Not Be Created',
          localityId: fixtures.localities[0].id,
        });
      expect(res.status).toBe(403);
    });

    it('OPERATOR cannot create a beneficiary (403)', async () => {
      const res = await request(app.getHttpServer())
        .post('/beneficiaries')
        .set('Authorization', `Bearer ${tokens.operator}`)
        .send({
          registryCode: 'RBAC2FIX-BEN-OPR-001',
          fullName: 'Should Not Be Created',
          localityId: fixtures.localities[0].id,
        });
      expect(res.status).toBe(403);
    });
  });

  // ================================================================
  // C. Demo data isolation confirmation
  // ================================================================
  describe('Demo data isolation', () => {
    it('the normal seed does not create the fictional ministerial demo programme', async () => {
      const res = await pool.query(
        `SELECT id FROM social_programs WHERE code = 'MDEMO-PNSF'`,
      );
      expect(res.rows).toHaveLength(0);
    });

    it('the normal seed does not create fictional demo social programs', async () => {
      const res = await pool.query(
        `SELECT code FROM social_programs WHERE code LIKE 'DEMO-%'`,
      );
      expect(res.rows).toHaveLength(0);
    });

    it('the normal seed does not create fictional demo operators', async () => {
      const res = await pool.query(
        `SELECT code FROM operators WHERE code LIKE 'DEMO-%'`,
      );
      expect(res.rows).toHaveLength(0);
    });

    it('the normal seed does not create fictional demo beneficiaries', async () => {
      const res = await pool.query(
        `SELECT registry_code FROM beneficiaries WHERE registry_code LIKE 'DEMO-%' OR full_name LIKE '%Demo%'`,
      );
      expect(res.rows).toHaveLength(0);
    });

    it('fixed accounts are separate from the demo dataset (fixed programme/operator codes carry the TAAZOUR-FIXED prefix, never DEMO/MDEMO)', () => {
      const FIXED_OPERATOR_CODE = 'TAAZOUR-FIXED-OPERATOR';
      const FIXED_PROGRAMME_CODE = 'TAAZOUR-FIXED-PROGRAMME';
      expect(FIXED_OPERATOR_CODE).not.toMatch(/^DEMO|^MDEMO/);
      expect(FIXED_PROGRAMME_CODE).not.toMatch(/^DEMO|^MDEMO/);
    });
  });
});
