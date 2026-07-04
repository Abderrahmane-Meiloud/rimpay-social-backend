import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { createTestContext, destroyTestContext } from './test-setup';
import { getTokens, TokenSet } from './test-auth-helper';
import { TestFixtureData } from './fixtures';

describe('Payment generation and cancellation (P0)', () => {
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

  async function createOpenOperation(
    code: string,
    beneficiaryCount = 3,
  ): Promise<string> {
    const createRes = await request(app.getHttpServer())
      .post('/payment-operations')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({
        socialProgramId: fixtures.program.id,
        name: `Pay Test Op ${code}`,
        code,
        regionId: fixtures.regions[0].id,
        plannedAmount: '25000.00',
      })
      .expect(201);
    const opId = createRes.body.id;

    const beneficiaries = fixtures.beneficiaries
      .slice(0, beneficiaryCount)
      .map((b) => ({ beneficiaryId: b.id, plannedAmount: '25000.00' }));
    await request(app.getHttpServer())
      .post(`/payment-operations/${opId}/beneficiaries`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ beneficiaries })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/payment-operations/${opId}/transition`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ targetStatus: 'VALIDATED' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/payment-operations/${opId}/open`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);

    return opId;
  }

  describe('Payment generation eligibility', () => {
    it('should create payments only for INCLUDED beneficiaries', async () => {
      const opId = await createOpenOperation('PG-ELIG-001', 5);

      const genRes = await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/payments/generate`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(201);

      expect(genRes.body.created).toBe(5);
      expect(genRes.body.skippedExisting).toBe(0);

      const paymentsRes = await request(app.getHttpServer())
        .get('/payments')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .query({ paymentOperationId: opId })
        .expect(200);

      expect(paymentsRes.body.data.length).toBe(5);
      for (const p of paymentsRes.body.data) {
        expect(p.status).toBe('PENDING');
        expect(parseFloat(p.amount)).toBe(25000);
      }
    });

    it('should not create payments for EXCLUDED beneficiaries', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/payment-operations')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          socialProgramId: fixtures.program.id,
          name: 'Exclusion Test',
          code: 'PG-EXCL-001',
          regionId: fixtures.regions[0].id,
          plannedAmount: '25000.00',
        })
        .expect(201);
      const opId = createRes.body.id;

      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/beneficiaries`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          beneficiaries: fixtures.beneficiaries
            .slice(0, 3)
            .map((b) => ({ beneficiaryId: b.id, plannedAmount: '25000.00' })),
        })
        .expect(200);

      // Exclude one beneficiary
      await request(app.getHttpServer())
        .delete(
          `/payment-operations/${opId}/beneficiaries/${fixtures.beneficiaries[0].id}`,
        )
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/transition`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ targetStatus: 'VALIDATED' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/open`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);

      const genRes = await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/payments/generate`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(201);

      expect(genRes.body.created).toBe(2);
    });

    it('repeated generation is idempotent', async () => {
      const opId = await createOpenOperation('PG-IDEM-001', 3);

      const r1 = await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/payments/generate`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(201);
      expect(r1.body.created).toBe(3);

      const r2 = await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/payments/generate`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(201);
      expect(r2.body.created).toBe(0);
      expect(r2.body.skippedExisting).toBe(3);

      const paymentsRes = await request(app.getHttpServer())
        .get('/payments')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .query({ paymentOperationId: opId })
        .expect(200);
      expect(paymentsRes.body.data.length).toBe(3);
    });
  });

  describe('Concurrent payment generation', () => {
    async function runConcurrencyScenario(label: string, beneficiaryCount: number) {
      const opId = await createOpenOperation(label, beneficiaryCount);

      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app.getHttpServer())
            .post(`/payment-operations/${opId}/payments/generate`)
            .set('Authorization', `Bearer ${tokens.admin}`),
        ),
      );

      for (const res of responses) {
        expect(res.status).not.toBeGreaterThanOrEqual(500);
        expect(res.status).toBe(201);
      }

      const totalCreated = responses.reduce((s, r) => s + (r.body.created ?? 0), 0);
      const totalSkipped = responses.reduce((s, r) => s + (r.body.skippedExisting ?? 0), 0);
      expect(totalCreated).toBe(beneficiaryCount);

      // Verify exact payment count in DB
      const dbResult = await pool.query(
        `SELECT COUNT(*) AS cnt FROM payments WHERE payment_operation_id = $1`,
        [opId],
      );
      expect(parseInt(dbResult.rows[0].cnt)).toBe(beneficiaryCount);

      // Verify no duplicate (paymentOperationId, beneficiaryId)
      const dupCheck = await pool.query(
        `SELECT payment_operation_id, beneficiary_id, COUNT(*) AS cnt
         FROM payments WHERE payment_operation_id = $1
         GROUP BY payment_operation_id, beneficiary_id
         HAVING COUNT(*) > 1`,
        [opId],
      );
      expect(dupCheck.rows.length).toBe(0);

      // Verify status history: exactly one record per payment
      const historyResult = await pool.query(
        `SELECT COUNT(*) AS cnt FROM payment_status_history psh
         JOIN payments p ON psh.payment_id = p.id
         WHERE p.payment_operation_id = $1`,
        [opId],
      );
      expect(parseInt(historyResult.rows[0].cnt)).toBe(beneficiaryCount);
    }

    it('5 concurrent requests with 4 beneficiaries — run 1', async () => {
      await runConcurrencyScenario('PG-CONC-R1', 4);
    });

    it('5 concurrent requests with 4 beneficiaries — run 2', async () => {
      await runConcurrencyScenario('PG-CONC-R2', 4);
    });

    it('5 concurrent requests with 6 beneficiaries — run 3', async () => {
      await runConcurrencyScenario('PG-CONC-R3', 6);
    });
  });

  describe('AuditLog proof for payment generation', () => {
    it('should create exactly one AuditLog per generate request', async () => {
      const opId = await createOpenOperation('AL-PROOF-001', 4);

      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/payments/generate`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(201);

      const auditResult = await pool.query(
        `SELECT action, entity_type, entity_id, new_values
         FROM audit_logs
         WHERE action = 'payment.generate' AND entity_id = $1
         ORDER BY created_at`,
        [opId],
      );

      expect(auditResult.rows.length).toBe(1);
      expect(auditResult.rows[0].action).toBe('payment.generate');
      expect(auditResult.rows[0].entity_type).toBe('PaymentOperation');
      expect(auditResult.rows[0].entity_id).toBe(opId);
      expect(auditResult.rows[0].new_values.created).toBe(4);
    });

    it('concurrent generation creates one AuditLog per request (5 total)', async () => {
      const opId = await createOpenOperation('AL-CONC-001', 3);

      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app.getHttpServer())
            .post(`/payment-operations/${opId}/payments/generate`)
            .set('Authorization', `Bearer ${tokens.admin}`),
        ),
      );

      for (const res of responses) {
        expect(res.status).toBe(201);
      }

      const auditResult = await pool.query(
        `SELECT COUNT(*) AS cnt FROM audit_logs
         WHERE action = 'payment.generate' AND entity_id = $1`,
        [opId],
      );

      expect(parseInt(auditResult.rows[0].cnt)).toBe(5);
    });
  });

  describe('Missing amount and excluded beneficiary', () => {
    it('should skip beneficiaries when both planned amounts are null', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/payment-operations')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          socialProgramId: fixtures.program.id,
          name: 'Missing Amount Test',
          code: 'MA-NULL-001',
          regionId: fixtures.regions[0].id,
        })
        .expect(201);
      const opId = createRes.body.id;

      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/beneficiaries`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          beneficiaries: fixtures.beneficiaries
            .slice(0, 3)
            .map((b) => ({ beneficiaryId: b.id })),
        })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/transition`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ targetStatus: 'VALIDATED' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/open`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);

      const genRes = await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/payments/generate`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(201);

      expect(genRes.body.created).toBe(0);
      expect(genRes.body.skippedMissingAmount).toBe(3);

      const paymentCount = await pool.query(
        `SELECT COUNT(*) AS cnt FROM payments WHERE payment_operation_id = $1`,
        [opId],
      );
      expect(parseInt(paymentCount.rows[0].cnt)).toBe(0);

      const historyCount = await pool.query(
        `SELECT COUNT(*) AS cnt FROM payment_status_history psh
         JOIN payments p ON psh.payment_id = p.id
         WHERE p.payment_operation_id = $1`,
        [opId],
      );
      expect(parseInt(historyCount.rows[0].cnt)).toBe(0);
    });

    it('EXCLUDED beneficiary produces no payment, history, or validation', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/payment-operations')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          socialProgramId: fixtures.program.id,
          name: 'Exclusion Evidence',
          code: 'EXCL-EV-001',
          regionId: fixtures.regions[0].id,
          plannedAmount: '25000.00',
        })
        .expect(201);
      const opId = createRes.body.id;

      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/beneficiaries`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          beneficiaries: fixtures.beneficiaries
            .slice(0, 3)
            .map((b) => ({ beneficiaryId: b.id, plannedAmount: '25000.00' })),
        })
        .expect(200);

      const excludedBeneficiaryId = fixtures.beneficiaries[0].id;

      await request(app.getHttpServer())
        .delete(`/payment-operations/${opId}/beneficiaries/${excludedBeneficiaryId}`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/transition`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ targetStatus: 'VALIDATED' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/open`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);

      const genRes = await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/payments/generate`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(201);

      expect(genRes.body.created).toBe(2);

      const excludedPayment = await pool.query(
        `SELECT COUNT(*) AS cnt FROM payments
         WHERE payment_operation_id = $1 AND beneficiary_id = $2`,
        [opId, excludedBeneficiaryId],
      );
      expect(parseInt(excludedPayment.rows[0].cnt)).toBe(0);

      const excludedHistory = await pool.query(
        `SELECT COUNT(*) AS cnt FROM payment_status_history psh
         JOIN payments p ON psh.payment_id = p.id
         WHERE p.payment_operation_id = $1 AND p.beneficiary_id = $2`,
        [opId, excludedBeneficiaryId],
      );
      expect(parseInt(excludedHistory.rows[0].cnt)).toBe(0);

      const excludedValidation = await pool.query(
        `SELECT COUNT(*) AS cnt FROM payment_validations pv
         JOIN payments p ON pv.payment_id = p.id
         WHERE p.payment_operation_id = $1 AND p.beneficiary_id = $2`,
        [opId, excludedBeneficiaryId],
      );
      expect(parseInt(excludedValidation.rows[0].cnt)).toBe(0);
    });
  });

  describe('Payment cancellation', () => {
    it('PENDING payment can be cancelled', async () => {
      const opId = await createOpenOperation('PC-PEND-001', 1);
      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/payments/generate`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(201);

      const paymentsRes = await request(app.getHttpServer())
        .get('/payments')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .query({ paymentOperationId: opId })
        .expect(200);
      const paymentId = paymentsRes.body.data[0].id;

      const cancelRes = await request(app.getHttpServer())
        .post(`/payments/${paymentId}/cancel`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ reason: 'Test cancellation' })
        .expect(200);

      expect(cancelRes.body.status).toBe('CANCELLED');
    });

    it('PAID payment cannot be cancelled (409)', async () => {
      // Build operation manually to assign agent BEFORE opening
      const createRes = await request(app.getHttpServer())
        .post('/payment-operations')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          socialProgramId: fixtures.program.id,
          name: 'PAID Cancel Test',
          code: 'PC-PAID-001',
          regionId: fixtures.regions[0].id,
          plannedAmount: '25000.00',
        })
        .expect(201);
      const opId = createRes.body.id;

      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/beneficiaries`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          beneficiaries: [
            { beneficiaryId: fixtures.beneficiaries[0].id, plannedAmount: '25000.00' },
          ],
        })
        .expect(200);

      // Assign agent BEFORE transitioning (DRAFT allows agent assignment)
      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/agents`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ agents: [{ agentId: fixtures.agent.id }] })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/transition`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ targetStatus: 'VALIDATED' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/open`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/payments/generate`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(201);

      const paymentsRes = await request(app.getHttpServer())
        .get('/payments')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .query({ paymentOperationId: opId })
        .expect(200);
      const paymentId = paymentsRes.body.data[0].id;

      // Validate payment to make it PAID
      await request(app.getHttpServer())
        .post(`/payments/${paymentId}/validate`)
        .set('Authorization', `Bearer ${tokens.agent}`)
        .send({
          agentId: fixtures.agent.id,
          deviceId: fixtures.device.id,
          authMethod: 'CNI',
          recipientType: 'BENEFICIARY',
          idempotencyKey: `paid-cancel-test-${paymentId}`,
        })
        .expect(200);

      // Attempt to cancel PAID payment
      const cancelRes = await request(app.getHttpServer())
        .post(`/payments/${paymentId}/cancel`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ reason: 'Should fail' });
      expect(cancelRes.status).toBe(409);
    });

    it('CANCELLED payment cannot be cancelled again (409)', async () => {
      const opId = await createOpenOperation('PC-DBLCXL-001', 1);
      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/payments/generate`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(201);

      const paymentsRes = await request(app.getHttpServer())
        .get('/payments')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .query({ paymentOperationId: opId })
        .expect(200);
      const paymentId = paymentsRes.body.data[0].id;

      await request(app.getHttpServer())
        .post(`/payments/${paymentId}/cancel`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ reason: 'First cancel' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/payments/${paymentId}/cancel`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ reason: 'Second cancel' });
      expect(res.status).toBe(409);
    });

    it('concurrent cancellation produces exactly one state transition', async () => {
      const opId = await createOpenOperation('PC-CONC-001', 1);
      await request(app.getHttpServer())
        .post(`/payment-operations/${opId}/payments/generate`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(201);

      const paymentsRes = await request(app.getHttpServer())
        .get('/payments')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .query({ paymentOperationId: opId })
        .expect(200);
      const paymentId = paymentsRes.body.data[0].id;

      const [r1, r2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/payments/${paymentId}/cancel`)
          .set('Authorization', `Bearer ${tokens.admin}`)
          .send({ reason: 'Concurrent cancel 1' }),
        request(app.getHttpServer())
          .post(`/payments/${paymentId}/cancel`)
          .set('Authorization', `Bearer ${tokens.admin}`)
          .send({ reason: 'Concurrent cancel 2' }),
      ]);

      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([200, 409]);

      // Exactly one cancellation history entry
      const histResult = await pool.query(
        `SELECT COUNT(*) AS cnt FROM payment_status_history
         WHERE payment_id = $1 AND to_status = 'CANCELLED'`,
        [paymentId],
      );
      expect(parseInt(histResult.rows[0].cnt)).toBe(1);
    });
  });
});
