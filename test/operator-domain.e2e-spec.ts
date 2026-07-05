import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { createTestContext, destroyTestContext } from './test-setup';
import { getTokens, TokenSet } from './test-auth-helper';
import { TestFixtureData } from './fixtures';

describe('Operator domain foundation (INSTITUTIONAL-RBAC-1)', () => {
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

  async function createOperator(
    code: string,
    overrides: Record<string, unknown> = {},
  ): Promise<request.Response> {
    return request(app.getHttpServer())
      .post('/operators')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({
        name: `Opérateur Test ${code}`,
        code,
        ...overrides,
      });
  }

  // 1. Operator can be created.
  it('creates an operator', async () => {
    const res = await createOperator('TEST-OPR-001');
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('TEST-OPR-001');
    expect(res.body.status).toBe('ACTIVE');
  });

  // 2. Operator list works.
  it('lists operators', async () => {
    await createOperator('TEST-OPR-002');
    const res = await request(app.getHttpServer())
      .get('/operators')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  // 3. Operator detail works.
  it('gets operator detail', async () => {
    const created = await createOperator('TEST-OPR-003');
    const res = await request(app.getHttpServer())
      .get(`/operators/${created.body.id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.agentsCount).toBe(0);
    expect(res.body.paymentOperationsCount).toBe(0);
  });

  // 4. Operator status can change.
  it('changes operator status', async () => {
    const created = await createOperator('TEST-OPR-004');
    const res = await request(app.getHttpServer())
      .patch(`/operators/${created.body.id}/status`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ status: 'SUSPENDED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUSPENDED');
  });

  // 5. Creating Agent with ACTIVE operatorId succeeds.
  it('creates an agent with an ACTIVE operatorId', async () => {
    const operator = await createOperator('TEST-OPR-005');

    const passwordHash = 'x'.repeat(60); // bcrypt-shaped placeholder, unused for login here
    const userResult = await pool.query(
      `INSERT INTO users (id, email, password_hash, full_name, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE', NOW(), NOW())
       RETURNING id`,
      ['agent-active-op@rimpay.test', passwordHash, 'Test Agent Active Operator'],
    );

    const res = await request(app.getHttpServer())
      .post('/agents')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({
        userId: userResult.rows[0].id,
        operatorId: operator.body.id,
        employeeCode: 'TEST-EMP-ACTIVE-OP',
      });

    expect(res.status).toBe(201);
    expect(res.body.operator.id).toBe(operator.body.id);
  });

  // 6. Creating Agent with INACTIVE operatorId fails.
  it('rejects creating an agent with an INACTIVE operatorId', async () => {
    const operator = await createOperator('TEST-OPR-006');
    await request(app.getHttpServer())
      .patch(`/operators/${operator.body.id}/status`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ status: 'INACTIVE' })
      .expect(200);

    const userResult = await pool.query(
      `INSERT INTO users (id, email, password_hash, full_name, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE', NOW(), NOW())
       RETURNING id`,
      ['agent-inactive-op@rimpay.test', 'x'.repeat(60), 'Test Agent Inactive Operator'],
    );

    const res = await request(app.getHttpServer())
      .post('/agents')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({
        userId: userResult.rows[0].id,
        operatorId: operator.body.id,
        employeeCode: 'TEST-EMP-INACTIVE-OP',
      });

    expect(res.status).toBe(409);
  });

  // 7. Creating PaymentOperation with ACTIVE operatorId succeeds.
  it('creates a payment operation with an ACTIVE operatorId', async () => {
    const operator = await createOperator('TEST-OPR-007');

    const res = await request(app.getHttpServer())
      .post('/payment-operations')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({
        socialProgramId: fixtures.program.id,
        operatorId: operator.body.id,
        name: 'Test Operation With Active Operator',
        code: 'TEST-OP-ACTIVE-OPR',
        regionId: fixtures.regions[0].id,
      });

    expect(res.status).toBe(201);
    expect(res.body.operator.id).toBe(operator.body.id);
  });

  // 8. Creating PaymentOperation with INACTIVE operatorId fails.
  it('rejects creating a payment operation with an INACTIVE operatorId', async () => {
    const operator = await createOperator('TEST-OPR-008');
    await request(app.getHttpServer())
      .patch(`/operators/${operator.body.id}/status`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ status: 'SUSPENDED' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/payment-operations')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({
        socialProgramId: fixtures.program.id,
        operatorId: operator.body.id,
        name: 'Test Operation With Suspended Operator',
        code: 'TEST-OP-SUSPENDED-OPR',
        regionId: fixtures.regions[0].id,
      });

    expect(res.status).toBe(409);
  });

  // 9. Existing Agent without operatorId still works.
  it('keeps working for an existing agent with no operatorId', async () => {
    const res = await request(app.getHttpServer())
      .get(`/agents/${fixtures.agent.id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.operator).toBeNull();
  });

  // 10. Existing PaymentOperation without operatorId still works.
  it('keeps working for a payment operation with no operatorId', async () => {
    const created = await request(app.getHttpServer())
      .post('/payment-operations')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({
        socialProgramId: fixtures.program.id,
        name: 'Test Operation Without Operator',
        code: 'TEST-OP-NO-OPR',
        regionId: fixtures.regions[0].id,
      })
      .expect(201);

    expect(created.body.operator).toBeNull();

    const res = await request(app.getHttpServer())
      .get(`/payment-operations/${created.body.id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.operator).toBeNull();
  });

  // 11. No existing API tests break — covered by the fact that this file
  // does not modify any other spec, and the full suite is run in CI (see
  // report). A duplicate-code conflict check is included here as a light
  // regression guard on the operator uniqueness rule specifically.
  it('rejects a duplicate operator code', async () => {
    await createOperator('TEST-OPR-DUP');
    const res = await createOperator('TEST-OPR-DUP');
    expect(res.status).toBe(409);
  });
});
