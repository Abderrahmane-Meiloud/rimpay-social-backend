import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { assertTestDatabase, truncateAllTables } from './test-db-guard';
import { seedTestFixtures, TestFixtureData } from './fixtures';

export async function createTestContext(): Promise<{
  app: INestApplication;
  pool: Pool;
  fixtures: TestFixtureData;
}> {
  const databaseUrl = process.env.DATABASE_URL_TEST;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL_TEST is not set for the test environment.');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  await assertTestDatabase(pool);
  await truncateAllTables(pool);

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();

  const fixtures = await seedTestFixtures(pool);

  return { app, pool, fixtures };
}

export async function destroyTestContext(ctx: {
  app: INestApplication;
  pool: Pool;
}): Promise<void> {
  await truncateAllTables(ctx.pool);
  await ctx.app.close();
  await ctx.pool.end();
}
