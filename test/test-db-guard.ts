import { Pool } from 'pg';

const REQUIRED_DB_NAME = 'rimpay_social_test';

export async function assertTestDatabase(pool: Pool): Promise<string> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      'Refusing to run: NODE_ENV is not "test".',
    );
  }

  if (!process.env.DATABASE_URL_TEST) {
    throw new Error(
      'Refusing to run: DATABASE_URL_TEST is not set.',
    );
  }

  const result = await pool.query('SELECT current_database() AS db_name');
  const dbName: string = result.rows[0]?.db_name;

  if (dbName !== REQUIRED_DB_NAME) {
    throw new Error(
      `Refusing to run: active database is "${dbName}", required exactly "${REQUIRED_DB_NAME}".`,
    );
  }

  return dbName;
}

export async function truncateAllTables(pool: Pool): Promise<void> {
  await assertTestDatabase(pool);

  await pool.query(`
    TRUNCATE TABLE
      anomalies,
      sync_items,
      sync_batches,
      payment_status_history,
      payment_validations,
      payments,
      operation_agents,
      payment_operation_beneficiaries,
      payment_operations,
      beneficiary_histories,
      beneficiary_documents,
      beneficiary_contacts,
      beneficiaries,
      social_programs,
      agent_geographic_assignments,
      devices,
      agents,
      reports,
      audit_logs,
      refresh_tokens,
      auth_sessions,
      user_roles,
      role_permissions,
      users,
      roles,
      permissions,
      localities,
      communes,
      moughataas,
      regions
    RESTART IDENTITY CASCADE
  `);
}

export function assertTestDatabaseSync(dbName: string): void {
  if (dbName !== REQUIRED_DB_NAME) {
    throw new Error(
      `Refusing to run: database is "${dbName}", required exactly "${REQUIRED_DB_NAME}".`,
    );
  }
}
