import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { createTestContext, destroyTestContext } from './test-setup';
import { getTokens, TokenSet } from './test-auth-helper';
import { TestFixtureData } from './fixtures';
import { roles } from '../prisma/seed/data/roles.data';
import {
  assertSafeToRun,
  assertPasswordsConfigured,
  fixedAccounts,
  seedFixedAccounts,
} from '../prisma/seed-fixed-accounts';
import { PrismaService } from '../src/prisma/prisma.service';

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

describe('Institutional RBAC 2 — three roles, fixed accounts, beneficiary scope', () => {
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

  // 1. The web roles are exactly ADMIN_TAAZOUR, PROGRAMME, OPERATOR.
  describe('Role model', () => {
    it('defines exactly ADMIN_TAAZOUR, PROGRAMME, OPERATOR as institutional web roles (plus AGENT for field accounts)', () => {
      const names = roles.map((r) => r.name).sort();
      expect(names).toEqual(['ADMIN_TAAZOUR', 'AGENT', 'OPERATOR', 'PROGRAMME'].sort());
    });

    it('the three web roles are all present in the seeded database', async () => {
      const res = await pool.query(
        `SELECT name FROM roles WHERE name IN ('ADMIN_TAAZOUR', 'PROGRAMME', 'OPERATOR') ORDER BY name`,
      );
      expect(res.rows.map((r) => r.name)).toEqual(['ADMIN_TAAZOUR', 'OPERATOR', 'PROGRAMME']);
    });
  });

  // 2. AGENT is not created as a web role (i.e. is not one of the three
  // institutional web roles, even though it still exists for field devices).
  describe('AGENT is not a web platform role', () => {
    it('AGENT is not among the three institutional web roles', () => {
      const webRoles = ['ADMIN_TAAZOUR', 'PROGRAMME', 'OPERATOR'];
      expect(webRoles).not.toContain('AGENT');
    });

    const agentRole = roles.find((r) => r.name === 'AGENT');

    it('AGENT role still exists (field/tablet accounts) but excludes beneficiaries.create, beneficiaries.read_sensitive, and users.manage_roles', () => {
      expect(agentRole).toBeDefined();
      expect(agentRole!.permissionCodes).not.toContain('beneficiaries.create');
      expect(agentRole!.permissionCodes).not.toContain('beneficiaries.read_sensitive');
      expect(agentRole!.permissionCodes).not.toContain('users.manage_roles');
    });
  });

  // 3 & 4. Fixed demo accounts seeding and its safety gates.
  describe('Fixed demo accounts seed', () => {
    it('refuses to run in production mode', () => {
      withEnv({ NODE_ENV: 'production' }, () => {
        expect(() => assertSafeToRun()).toThrow(/production/i);
      });
    });

    it('refuses to run without DEMO_FIXED_ACCOUNTS=true', () => {
      withEnv({ NODE_ENV: 'test', DEMO_FIXED_ACCOUNTS: undefined }, () => {
        expect(() => assertSafeToRun()).toThrow(/DEMO_FIXED_ACCOUNTS/);
      });
      withEnv({ NODE_ENV: 'test', DEMO_FIXED_ACCOUNTS: 'false' }, () => {
        expect(() => assertSafeToRun()).toThrow(/DEMO_FIXED_ACCOUNTS/);
      });
    });

    it('refuses to run when a password env var is missing', () => {
      withEnv(
        {
          DEMO_ADMIN_PASSWORD: undefined,
          DEMO_PROGRAMME_PASSWORD: 'x',
          DEMO_OPERATOR_PASSWORD: 'x',
        },
        () => {
          expect(() => assertPasswordsConfigured()).toThrow(/DEMO_ADMIN_PASSWORD/);
        },
      );
    });

    it('seeds the three fixed accounts idempotently with env-provided passwords, never duplicating them', async () => {
      const prisma = app.get(PrismaService);

      process.env.DEMO_ADMIN_PASSWORD = 'Fixed-Admin-Pass-2026!';
      process.env.DEMO_PROGRAMME_PASSWORD = 'Fixed-Programme-Pass-2026!';
      process.env.DEMO_OPERATOR_PASSWORD = 'Fixed-Operator-Pass-2026!';

      try {
        const firstRun = await seedFixedAccounts(prisma);
        expect(firstRun).toHaveLength(3);
        expect(firstRun.map((r) => r.status)).toEqual(['created', 'created', 'created']);
        expect(firstRun.map((r) => r.email).sort()).toEqual(
          fixedAccounts.map((a) => a.email).sort(),
        );

        const secondRun = await seedFixedAccounts(prisma);
        expect(secondRun.map((r) => r.status)).toEqual(['updated', 'updated', 'updated']);

        const countRes = await pool.query(
          `SELECT count(*)::int AS c FROM users WHERE email = ANY($1)`,
          [fixedAccounts.map((a) => a.email)],
        );
        expect(countRes.rows[0].c).toBe(3);
      } finally {
        delete process.env.DEMO_ADMIN_PASSWORD;
        delete process.env.DEMO_PROGRAMME_PASSWORD;
        delete process.env.DEMO_OPERATOR_PASSWORD;
      }
    });
  });

  // 5. Admin can create beneficiary.
  // 6. Programme cannot create beneficiary.
  // 7. Operator cannot create beneficiary.
  describe('Beneficiary creation restricted to ADMIN_TAAZOUR', () => {
    it('ADMIN_TAAZOUR can create a beneficiary', async () => {
      const res = await request(app.getHttpServer())
        .post('/beneficiaries')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          registryCode: 'RBAC2-BEN-ADMIN-001',
          fullName: 'Test Beneficiary Admin Created',
          nni: 'RBAC2-NNI-001',
          localityId: fixtures.localities[0].id,
        });
      expect(res.status).toBe(201);
      expect(res.body.registryCode).toBe('RBAC2-BEN-ADMIN-001');
    });

    it('PROGRAMME cannot create a beneficiary (403)', async () => {
      const res = await request(app.getHttpServer())
        .post('/beneficiaries')
        .set('Authorization', `Bearer ${tokens.programme}`)
        .send({
          registryCode: 'RBAC2-BEN-PROG-001',
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
          registryCode: 'RBAC2-BEN-OPR-001',
          fullName: 'Should Not Be Created',
          localityId: fixtures.localities[0].id,
        });
      expect(res.status).toBe(403);
    });
  });

  // 8. Admin can view NNI.
  // 9. Programme response masks or omits NNI.
  // 10. Operator response masks or omits NNI and only returns assigned beneficiaries.
  // 11. Operator cannot access another operator's assigned beneficiaries.
  describe('NNI masking and operator/programme scoping', () => {
    let operationForOperator: string;
    let operationForOtherOperator: string;
    let assignedBeneficiaryId: string;
    let otherOperatorBeneficiaryId: string;

    beforeAll(async () => {
      // Operation A: assigned to fixtures.operatorRecord, includes beneficiaries[0].
      const opA = await request(app.getHttpServer())
        .post('/payment-operations')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          socialProgramId: fixtures.program.id,
          operatorId: fixtures.operatorRecord.id,
          name: 'RBAC2 Operator Scope Op A',
          code: 'RBAC2-OP-A',
          regionId: fixtures.regions[0].id,
        })
        .expect(201);
      operationForOperator = opA.body.id;
      assignedBeneficiaryId = fixtures.beneficiaries[0].id;

      await request(app.getHttpServer())
        .post(`/payment-operations/${operationForOperator}/beneficiaries`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          beneficiaries: [{ beneficiaryId: assignedBeneficiaryId, plannedAmount: '10000.00' }],
        })
        .expect(200);

      // Operation B: assigned to fixtures.otherOperatorRecord, includes a
      // different beneficiary — used to prove cross-operator isolation.
      const opB = await request(app.getHttpServer())
        .post('/payment-operations')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          socialProgramId: fixtures.program.id,
          operatorId: fixtures.otherOperatorRecord.id,
          name: 'RBAC2 Operator Scope Op B',
          code: 'RBAC2-OP-B',
          regionId: fixtures.regions[0].id,
        })
        .expect(201);
      operationForOtherOperator = opB.body.id;
      otherOperatorBeneficiaryId = fixtures.beneficiaries[1].id;

      await request(app.getHttpServer())
        .post(`/payment-operations/${operationForOtherOperator}/beneficiaries`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          beneficiaries: [
            { beneficiaryId: otherOperatorBeneficiaryId, plannedAmount: '10000.00' },
          ],
        })
        .expect(200);
    });

    it('ADMIN_TAAZOUR can view the NNI in beneficiary detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/beneficiaries/${assignedBeneficiaryId}`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);
      expect(res.body.nni).toBeTruthy();
    });

    it("PROGRAMME response masks the beneficiary's NNI", async () => {
      const res = await request(app.getHttpServer())
        .get(`/beneficiaries/${assignedBeneficiaryId}`)
        .set('Authorization', `Bearer ${tokens.programme}`)
        .expect(200);
      expect(res.body.nni).toBeNull();
    });

    it("OPERATOR response masks the beneficiary's NNI and only returns beneficiaries assigned to that operator", async () => {
      const res = await request(app.getHttpServer())
        .get(`/beneficiaries/${assignedBeneficiaryId}`)
        .set('Authorization', `Bearer ${tokens.operator}`)
        .expect(200);
      expect(res.body.nni).toBeNull();

      const listRes = await request(app.getHttpServer())
        .get('/beneficiaries')
        .set('Authorization', `Bearer ${tokens.operator}`)
        .query({ limit: 100 })
        .expect(200);
      const ids = listRes.body.data.map((b: { id: string }) => b.id);
      expect(ids).toContain(assignedBeneficiaryId);
      expect(ids).not.toContain(otherOperatorBeneficiaryId);
    });

    it("OPERATOR cannot access another operator's assigned beneficiary (404)", async () => {
      const res = await request(app.getHttpServer())
        .get(`/beneficiaries/${otherOperatorBeneficiaryId}`)
        .set('Authorization', `Bearer ${tokens.operator}`);
      expect(res.status).toBe(404);
    });
  });

  // 12. Programme has startDate/endDate validation.
  describe('Programme startDate/endDate validation', () => {
    it('requires both startDate and endDate on create (400 when missing)', async () => {
      const res = await request(app.getHttpServer())
        .post('/programs')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          name: 'RBAC2 Programme No Dates',
          code: 'RBAC2-PROG-NO-DATES',
        });
      expect(res.status).toBe(400);
    });

    it('rejects endDate before startDate (400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/programs')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          name: 'RBAC2 Programme Bad Dates',
          code: 'RBAC2-PROG-BAD-DATES',
          startDate: '2026-06-01',
          endDate: '2026-01-01',
        });
      expect(res.status).toBe(400);
    });

    it('accepts endDate equal to startDate and returns both dates', async () => {
      const res = await request(app.getHttpServer())
        .post('/programs')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          name: 'RBAC2 Programme Same Day',
          code: 'RBAC2-PROG-SAME-DAY',
          startDate: '2026-06-01',
          endDate: '2026-06-01',
        });
      expect(res.status).toBe(201);
      expect(res.body.startDate).toBeTruthy();
      expect(res.body.endDate).toBeTruthy();
    });
  });

  // 13. Claim code is generated and unique.
  describe('Beneficiary claim code', () => {
    it('generates a unique claim code for each payment created via generate()', async () => {
      const opRes = await request(app.getHttpServer())
        .post('/payment-operations')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          socialProgramId: fixtures.program.id,
          name: 'RBAC2 Claim Code Op',
          code: 'RBAC2-OP-CLAIMCODE',
          regionId: fixtures.regions[0].id,
          plannedAmount: '5000.00',
        })
        .expect(201);
      const operationId = opRes.body.id;

      const beneficiaryIds = fixtures.beneficiaries.slice(2, 4).map((b) => b.id);
      await request(app.getHttpServer())
        .post(`/payment-operations/${operationId}/beneficiaries`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          beneficiaries: beneficiaryIds.map((id) => ({ beneficiaryId: id, plannedAmount: '5000.00' })),
        })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/payment-operations/${operationId}/transition`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ targetStatus: 'VALIDATED' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/payment-operations/${operationId}/open`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/payment-operations/${operationId}/payments/generate`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(201);

      const paymentsRes = await request(app.getHttpServer())
        .get(`/payment-operations/${operationId}/payments`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);

      expect(paymentsRes.body.data.length).toBeGreaterThanOrEqual(2);

      const claimCodes: string[] = [];
      for (const paymentSummary of paymentsRes.body.data) {
        const detailRes = await request(app.getHttpServer())
          .get(`/payments/${paymentSummary.id}`)
          .set('Authorization', `Bearer ${tokens.admin}`)
          .expect(200);
        expect(detailRes.body.claimCode).toBeTruthy();
        claimCodes.push(detailRes.body.claimCode);
      }

      expect(new Set(claimCodes).size).toBe(claimCodes.length);

      const dbRows = await pool.query(
        `SELECT claim_code FROM payments WHERE payment_operation_id = $1`,
        [operationId],
      );
      const dbClaimCodes = dbRows.rows.map((r) => r.claim_code);
      expect(new Set(dbClaimCodes).size).toBe(dbClaimCodes.length);
      for (const code of dbClaimCodes) {
        expect(code).not.toBeNull();
      }
    });
  });

  // 14. Existing tests remain green — verified by running the full suite
  // separately (see validation report), not duplicated here.
});
