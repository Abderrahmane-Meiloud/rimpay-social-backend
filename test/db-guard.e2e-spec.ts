import { Pool } from 'pg';
import { assertTestDatabase, assertTestDatabaseSync } from './test-db-guard';

describe('Test database safety guard', () => {
  it('should reject a mocked non-test database name', () => {
    expect(() => assertTestDatabaseSync('rimpay_social')).toThrow(
      'required exactly "rimpay_social_test"',
    );
  });

  it('should reject a database name containing _test but not matching exactly', () => {
    expect(() => assertTestDatabaseSync('rimpay_social_test_other')).toThrow(
      'required exactly "rimpay_social_test"',
    );
  });

  it('should reject a database name with _test only as substring', () => {
    expect(() => assertTestDatabaseSync('my_test_db')).toThrow(
      'required exactly "rimpay_social_test"',
    );
  });

  it('should accept exactly rimpay_social_test', () => {
    expect(() => assertTestDatabaseSync('rimpay_social_test')).not.toThrow();
  });

  it('should verify the real test database connection', async () => {
    const databaseUrl = process.env.DATABASE_URL_TEST;
    expect(databaseUrl).toBeDefined();

    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const dbName = await assertTestDatabase(pool);
      expect(dbName).toBe('rimpay_social_test');
    } finally {
      await pool.end();
    }
  });

  it('should refuse when DATABASE_URL_TEST is missing', async () => {
    const saved = process.env.DATABASE_URL_TEST;
    delete process.env.DATABASE_URL_TEST;
    try {
      const pool = new Pool({ connectionString: saved });
      await expect(assertTestDatabase(pool)).rejects.toThrow(
        'DATABASE_URL_TEST is not set',
      );
      await pool.end();
    } finally {
      process.env.DATABASE_URL_TEST = saved;
    }
  });
});
