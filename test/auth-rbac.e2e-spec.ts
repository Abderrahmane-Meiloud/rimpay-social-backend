import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { createTestContext, destroyTestContext } from './test-setup';
import { getTokens, TokenSet } from './test-auth-helper';
import { TestFixtureData } from './fixtures';

describe('Authentication and RBAC (P0)', () => {
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

  describe('Unauthenticated access', () => {
    it('should return 401 for protected endpoint without token', async () => {
      await request(app.getHttpServer())
        .get('/dashboard/summary')
        .expect(401);
    });

    it('should return 401 for invalid JWT', async () => {
      await request(app.getHttpServer())
        .get('/dashboard/summary')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);
    });

    it('should return 401 for malformed JWT', async () => {
      const fakeToken =
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0IiwiZXhwIjoxfQ.invalid';
      await request(app.getHttpServer())
        .get('/dashboard/summary')
        .set('Authorization', `Bearer ${fakeToken}`)
        .expect(401);
    });

    it('should allow unauthenticated access to public /health endpoint', async () => {
      await request(app.getHttpServer()).get('/health').expect(200);
    });

    it('should reject login with wrong password (401)', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: fixtures.users.admin.email, password: 'wrong-password' })
        .expect(401);
    });
  });

  describe('Successful login', () => {
    it('should return access token, user, roles, and permissions', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: fixtures.users.admin.email,
          password: fixtures.users.admin.password,
        })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.user.email).toBe(fixtures.users.admin.email);
      expect(res.body.roles).toContain('ADMIN');
      expect(Array.isArray(res.body.permissions)).toBe(true);
      expect(res.body.permissions.length).toBeGreaterThan(0);
    });
  });

  describe('GET /auth/me', () => {
    it('should return current user with roles and permissions', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);

      expect(res.body.user.email).toBe(fixtures.users.admin.email);
      expect(res.body.roles).toContain('ADMIN');
      expect(res.body.permissions.length).toBeGreaterThan(0);
    });
  });

  describe('RBAC permission enforcement', () => {
    it('AUDITOR cannot create beneficiary (403)', async () => {
      await request(app.getHttpServer())
        .post('/beneficiaries')
        .set('Authorization', `Bearer ${tokens.auditor}`)
        .send({
          registryCode: 'RBAC-TEST-001',
          fullName: 'RBAC Test',
          localityId: fixtures.localities[0].id,
        })
        .expect(403);
    });

    it('AGENT cannot create payment operation (403)', async () => {
      await request(app.getHttpServer())
        .post('/payment-operations')
        .set('Authorization', `Bearer ${tokens.agent}`)
        .send({
          socialProgramId: fixtures.program.id,
          name: 'RBAC Test Op',
          code: 'RBAC-TEST-OP',
        })
        .expect(403);
    });

    it('AUDITOR cannot resolve anomaly (403)', async () => {
      await request(app.getHttpServer())
        .patch('/anomalies/00000000-0000-0000-0000-000000000000/resolve')
        .set('Authorization', `Bearer ${tokens.auditor}`)
        .send({ resolutionNotes: 'test' })
        .expect(403);
    });

    it('ADMIN can access dashboard (200)', async () => {
      await request(app.getHttpServer())
        .get('/dashboard/summary')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);
    });

    it('AUDITOR can read audit logs (200)', async () => {
      await request(app.getHttpServer())
        .get('/audit-logs')
        .set('Authorization', `Bearer ${tokens.auditor}`)
        .expect(200);
    });

    it('PROGRAM_MANAGER can create payment operation (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/payment-operations')
        .set('Authorization', `Bearer ${tokens.programManager}`)
        .send({
          socialProgramId: fixtures.program.id,
          name: 'RBAC Allowed Op',
          code: 'RBAC-ALLOWED-OP-001',
          regionId: fixtures.regions[0].id,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
    });
  });
});
