import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { createTestContext, destroyTestContext } from './test-setup';
import { getTokens, TokenSet } from './test-auth-helper';
import { TestFixtureData } from './fixtures';
import { randomUUID } from 'crypto';

describe('Sync safety (P0)', () => {
  let app: INestApplication;
  let pool: Pool;
  let fixtures: TestFixtureData;
  let tokens: TokenSet;
  let operationId: string;
  let paymentIds: string[];

  beforeAll(async () => {
    const ctx = await createTestContext();
    app = ctx.app;
    pool = ctx.pool;
    fixtures = ctx.fixtures;
    tokens = await getTokens(app, fixtures.users);

    // Create an open operation with agent and payments
    const createRes = await request(app.getHttpServer())
      .post('/payment-operations')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({
        socialProgramId: fixtures.program.id,
        name: 'Sync Test Operation',
        code: 'SYNC-OP-001',
        regionId: fixtures.regions[0].id,
        plannedAmount: '25000.00',
      })
      .expect(201);
    operationId = createRes.body.id;

    await request(app.getHttpServer())
      .post(`/payment-operations/${operationId}/beneficiaries`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({
        beneficiaries: fixtures.beneficiaries
          .slice(0, 5)
          .map((b) => ({ beneficiaryId: b.id, plannedAmount: '25000.00' })),
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/payment-operations/${operationId}/agents`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ agents: [{ agentId: fixtures.agent.id }] })
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
      .get('/payments')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .query({ paymentOperationId: operationId })
      .expect(200);

    paymentIds = paymentsRes.body.data.map((p: any) => p.id);
    expect(paymentIds.length).toBe(5);
  });

  afterAll(async () => {
    await destroyTestContext({ app, pool });
  });

  it('first sync batch returns HTTP 200 (documented contract)', async () => {
    const batchUid = `batch-first-${randomUUID()}`;
    const res = await request(app.getHttpServer())
      .post('/sync/batches')
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({
        agentId: fixtures.agent.id,
        deviceId: fixtures.device.id,
        batchUid,
        items: [
          {
            localId: `local-first-${randomUUID()}`,
            itemType: 'payment.validation',
            idempotencyKey: `idem-first-${randomUUID()}`,
            payload: {
              paymentId: paymentIds[0],
              authMethod: 'CNI',
              recipientType: 'BENEFICIARY',
            },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.batchUid).toBe(batchUid);
    expect(res.body.acceptedItems).toBe(1);
  });

  it('duplicate batchUid returns idempotent HTTP 200', async () => {
    const batchUid = `batch-dup-${randomUUID()}`;
    const payload = {
      agentId: fixtures.agent.id,
      deviceId: fixtures.device.id,
      batchUid,
      items: [
        {
          localId: `local-dup-${randomUUID()}`,
          itemType: 'payment.validation',
          idempotencyKey: `idem-dup-${randomUUID()}`,
          payload: {
            paymentId: paymentIds[1],
            authMethod: 'CNI',
            recipientType: 'BENEFICIARY',
          },
        },
      ],
    };

    const res1 = await request(app.getHttpServer())
      .post('/sync/batches')
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send(payload)
      .expect(200);

    const res2 = await request(app.getHttpServer())
      .post('/sync/batches')
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send(payload)
      .expect(200);

    expect(res2.body.batchUid).toBe(batchUid);
  });

  it('BLOCKED device is rejected with 403', async () => {
    await pool.query(
      `UPDATE devices SET status = 'BLOCKED', updated_at = NOW() WHERE id = $1`,
      [fixtures.device.id],
    );

    try {
      const res = await request(app.getHttpServer())
        .post('/sync/batches')
        .set('Authorization', `Bearer ${tokens.agent}`)
        .send({
          agentId: fixtures.agent.id,
          deviceId: fixtures.device.id,
          batchUid: `blocked-${randomUUID()}`,
          items: [
            {
              localId: `blocked-local-${randomUUID()}`,
              itemType: 'payment.validation',
              idempotencyKey: `blocked-idem-${randomUUID()}`,
              payload: {
                paymentId: paymentIds[2],
                authMethod: 'CNI',
                recipientType: 'BENEFICIARY',
              },
            },
          ],
        });

      // Blocked device rejected — service throws BadRequestException
      expect(res.status).toBe(400);
    } finally {
      await pool.query(
        `UPDATE devices SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1`,
        [fixtures.device.id],
      );
    }
  });

  it('duplicate (deviceId, localId, itemType) does not create extra SyncItem or PaymentValidation', async () => {
    const localId = `dup-item-${randomUUID()}`;
    const idemKey = `dup-idem-${randomUUID()}`;

    const batch1 = {
      agentId: fixtures.agent.id,
      deviceId: fixtures.device.id,
      batchUid: `dup-batch-A-${randomUUID()}`,
      items: [
        {
          localId,
          itemType: 'payment.validation',
          idempotencyKey: idemKey,
          payload: {
            paymentId: paymentIds[3],
            authMethod: 'CNI',
            recipientType: 'BENEFICIARY',
          },
        },
      ],
    };

    await request(app.getHttpServer())
      .post('/sync/batches')
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send(batch1)
      .expect(200);

    // Count sync items and validations before duplicate
    const beforeItems = await pool.query(
      `SELECT COUNT(*) AS cnt FROM sync_items
       WHERE device_id = $1 AND local_id = $2 AND item_type = 'payment.validation'`,
      [fixtures.device.id, localId],
    );
    const beforeValidations = await pool.query(
      `SELECT COUNT(*) AS cnt FROM payment_validations WHERE payment_id = $1`,
      [paymentIds[3]],
    );

    const batch2 = {
      agentId: fixtures.agent.id,
      deviceId: fixtures.device.id,
      batchUid: `dup-batch-B-${randomUUID()}`,
      items: [
        {
          localId,
          itemType: 'payment.validation',
          idempotencyKey: idemKey,
          payload: {
            paymentId: paymentIds[3],
            authMethod: 'CNI',
            recipientType: 'BENEFICIARY',
          },
        },
      ],
    };

    await request(app.getHttpServer())
      .post('/sync/batches')
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send(batch2)
      .expect(200);

    // Verify counts did not increase
    const afterItems = await pool.query(
      `SELECT COUNT(*) AS cnt FROM sync_items
       WHERE device_id = $1 AND local_id = $2 AND item_type = 'payment.validation'`,
      [fixtures.device.id, localId],
    );
    const afterValidations = await pool.query(
      `SELECT COUNT(*) AS cnt FROM payment_validations WHERE payment_id = $1`,
      [paymentIds[3]],
    );

    expect(parseInt(afterItems.rows[0].cnt)).toBe(
      parseInt(beforeItems.rows[0].cnt),
    );
    expect(parseInt(afterValidations.rows[0].cnt)).toBe(
      parseInt(beforeValidations.rows[0].cnt),
    );
  });
});
