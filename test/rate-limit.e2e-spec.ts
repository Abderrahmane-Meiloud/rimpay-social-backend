import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'pg';
import { SessionService } from '../src/auth/session.service';
import { createTestContext, destroyTestContext } from './test-setup';
import { TestFixtureData } from './fixtures';

describe('Rate Limiting (P0)', () => {
  let app: INestApplication;
  let pool: Pool;
  let fixtures: TestFixtureData;
  let sessionService: SessionService;
  let jwtService: JwtService;

  beforeAll(async () => {
    const ctx = await createTestContext();
    app = ctx.app;
    pool = ctx.pool;
    fixtures = ctx.fixtures;
    sessionService = app.get(SessionService);
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await destroyTestContext({ app, pool });
  });

  it('login rate limit: 6th request returns 429', async () => {
    const results: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'ratelimit@test.local', password: 'wrong' });
      results.push(res.status);
    }

    const first5 = results.slice(0, 5);
    expect(first5.every((s) => s !== 429)).toBe(true);
    expect(results[5]).toBe(429);
  });

  it('refresh rate limit: 11th request returns 429', async () => {
    const results: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', `rid=fake-token-${i}`);
      results.push(res.status);
    }

    const first10 = results.slice(0, 10);
    expect(first10.every((s) => s !== 429)).toBe(true);
    expect(results[10]).toBe(429);
  });

  it('GET /auth/me is not throttled beyond the login/refresh limits', async () => {
    const { sessionId } = await sessionService.createSessionWithAudit(
      fixtures.users.admin.id,
      {},
    );
    const token = await jwtService.signAsync({
      sub: fixtures.users.admin.id,
      email: fixtures.users.admin.email,
      roles: ['ADMIN'],
      sid: sessionId,
      av: 0,
    });

    const results: number[] = [];
    for (let i = 0; i < 20; i++) {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);
      results.push(res.status);
    }

    expect(results.every((s) => s === 200)).toBe(true);
  });

  it('POST /auth/logout is not throttled beyond the login/refresh limits', async () => {
    const results: number[] = [];
    for (let i = 0; i < 20; i++) {
      const { sessionId } = await sessionService.createSessionWithAudit(
        fixtures.users.admin.id,
        {},
      );
      const token = await jwtService.signAsync({
        sub: fixtures.users.admin.id,
        email: fixtures.users.admin.email,
        roles: ['ADMIN'],
        sid: sessionId,
        av: 0,
      });

      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`);
      results.push(res.status);
    }

    expect(results.every((s) => s === 200)).toBe(true);
  });
});
