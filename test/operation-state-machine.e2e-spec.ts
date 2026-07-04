import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { createTestContext, destroyTestContext } from './test-setup';
import { getTokens, TokenSet } from './test-auth-helper';
import { TestFixtureData } from './fixtures';

describe('Operation state machine (P0)', () => {
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

  async function createOperation(code: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/payment-operations')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({
        socialProgramId: fixtures.program.id,
        name: `Test Operation ${code}`,
        code,
        regionId: fixtures.regions[0].id,
      })
      .expect(201);
    return res.body.id;
  }

  async function assignBeneficiaries(operationId: string, count: number = 3) {
    const beneficiaries = fixtures.beneficiaries
      .slice(0, count)
      .map((b) => ({ beneficiaryId: b.id, plannedAmount: '25000.00' }));
    await request(app.getHttpServer())
      .post(`/payment-operations/${operationId}/beneficiaries`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ beneficiaries })
      .expect(200);
  }

  async function transition(
    operationId: string,
    targetStatus: string,
  ): Promise<request.Response> {
    return await request(app.getHttpServer())
      .post(`/payment-operations/${operationId}/transition`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ targetStatus });
  }

  describe('Valid transitions', () => {
    it('DRAFT → VALIDATED', async () => {
      const opId = await createOperation('SM-V-001');
      const res = await transition(opId, 'VALIDATED');
      expect(res.status).toBe(200);
    });

    it('DRAFT → ARCHIVED', async () => {
      const opId = await createOperation('SM-V-002');
      const res = await transition(opId, 'ARCHIVED');
      expect(res.status).toBe(200);
    });

    it('VALIDATED → OPEN (with INCLUDED beneficiaries)', async () => {
      const opId = await createOperation('SM-V-003');
      await assignBeneficiaries(opId);
      await transition(opId, 'VALIDATED');
      const res = await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/open`)
        .set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
    });

    it('OPEN → IN_PROGRESS', async () => {
      const opId = await createOperation('SM-V-004');
      await assignBeneficiaries(opId);
      await transition(opId, 'VALIDATED');
      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/open`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);
      const res = await transition(opId, 'IN_PROGRESS');
      expect(res.status).toBe(200);
    });

    it('IN_PROGRESS → SUSPENDED', async () => {
      const opId = await createOperation('SM-V-005');
      await assignBeneficiaries(opId);
      await transition(opId, 'VALIDATED');
      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/open`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);
      await transition(opId, 'IN_PROGRESS');
      const res = await transition(opId, 'SUSPENDED');
      expect(res.status).toBe(200);
    });

    it('IN_PROGRESS → CLOSED via /close endpoint', async () => {
      const opId = await createOperation('SM-V-006');
      await assignBeneficiaries(opId);
      await transition(opId, 'VALIDATED');
      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/open`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);
      await transition(opId, 'IN_PROGRESS');
      const res = await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/close`)
        .set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
    });
  });

  describe('Invalid transitions', () => {
    it('DRAFT → OPEN via /transition must be rejected (400 — use dedicated endpoint)', async () => {
      const opId = await createOperation('SM-I-001');
      const res = await transition(opId, 'OPEN');
      expect(res.status).toBe(400);
    });

    it('DRAFT → CLOSED via /transition must be rejected (400 — use dedicated endpoint)', async () => {
      const opId = await createOperation('SM-I-002');
      const res = await transition(opId, 'CLOSED');
      expect(res.status).toBe(400);
    });

    it('DRAFT → IN_PROGRESS must be rejected (409)', async () => {
      const opId = await createOperation('SM-I-003');
      const res = await transition(opId, 'IN_PROGRESS');
      expect(res.status).toBe(409);
    });

    it('DRAFT → SUSPENDED must be rejected (409)', async () => {
      const opId = await createOperation('SM-I-004');
      const res = await transition(opId, 'SUSPENDED');
      expect(res.status).toBe(409);
    });

    it('ARCHIVED → VALIDATED must be rejected (409)', async () => {
      const opId = await createOperation('SM-I-005');
      await transition(opId, 'ARCHIVED');
      const res = await transition(opId, 'VALIDATED');
      expect(res.status).toBe(409);
    });

    it('ARCHIVED → ARCHIVED must be rejected (409)', async () => {
      const opId = await createOperation('SM-I-006');
      await transition(opId, 'ARCHIVED');
      const res = await transition(opId, 'ARCHIVED');
      expect(res.status).toBe(409);
    });

    it('VALIDATED → OPEN without INCLUDED beneficiaries must be rejected (409)', async () => {
      const opId = await createOperation('SM-I-007');
      await transition(opId, 'VALIDATED');
      const res = await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/open`)
        .set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(409);
    });
  });
});
