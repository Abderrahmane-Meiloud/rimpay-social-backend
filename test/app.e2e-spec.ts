import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestContext, destroyTestContext } from './test-setup';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    const ctx = await createTestContext();
    app = ctx.app;
    pool = ctx.pool;
  });

  afterAll(async () => {
    await destroyTestContext({ app, pool });
  });

  it('/ (GET) should return 200', () => {
    return request(app.getHttpServer()).get('/').expect(200);
  });
});

describe('PrismaService idempotent shutdown', () => {
  it('repeated onModuleDestroy does not throw and app closes cleanly', async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const prisma = app.get(PrismaService);

    await prisma.onModuleDestroy();
    await expect(prisma.onModuleDestroy()).resolves.toBeUndefined();

    await expect(app.close()).resolves.toBeUndefined();
  });
});
