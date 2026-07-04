import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { permissions } from '../../prisma/seed/data/permissions.data';
import { roles } from '../../prisma/seed/data/roles.data';

const BCRYPT_COST = 4; // low cost for test speed

export const TEST_PASSWORDS = {
  admin: 'Test-Admin-Pass-2026!',
  programManager: 'Test-PM-Pass-2026!',
  supervisor: 'Test-Supervisor-Pass-2026!',
  agent: 'Test-Agent-Pass-2026!',
  auditor: 'Test-Auditor-Pass-2026!',
};

export interface TestFixtureData {
  permissions: Array<{ id: string; code: string }>;
  roles: Array<{ id: string; name: string }>;
  users: {
    admin: { id: string; email: string; password: string };
    programManager: { id: string; email: string; password: string };
    supervisor: { id: string; email: string; password: string };
    agent: { id: string; email: string; password: string };
    auditor: { id: string; email: string; password: string };
  };
  regions: Array<{ id: string; code: string; name: string }>;
  moughataas: Array<{ id: string; code: string; name: string }>;
  communes: Array<{ id: string; code: string; name: string }>;
  localities: Array<{ id: string; code: string; name: string }>;
  program: { id: string; code: string; name: string };
  beneficiaries: Array<{ id: string; registryCode: string; fullName: string }>;
  agent: { id: string; userId: string; employeeCode: string };
  device: { id: string; deviceUid: string };
}

export async function seedTestFixtures(pool: Pool): Promise<TestFixtureData> {
  const data: TestFixtureData = {
    permissions: [],
    roles: [],
    users: {} as TestFixtureData['users'],
    regions: [],
    moughataas: [],
    communes: [],
    localities: [],
    program: {} as TestFixtureData['program'],
    beneficiaries: [],
    agent: {} as TestFixtureData['agent'],
    device: {} as TestFixtureData['device'],
  };

  // 1. Permissions
  for (const perm of permissions) {
    const result = await pool.query(
      `INSERT INTO permissions (id, code, description, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
       RETURNING id, code`,
      [perm.code, perm.description],
    );
    data.permissions.push(result.rows[0]);
  }

  // 2. Roles
  for (const role of roles) {
    const result = await pool.query(
      `INSERT INTO roles (id, name, description, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
       RETURNING id, name`,
      [role.name, role.description],
    );
    data.roles.push(result.rows[0]);

    // Link role → permissions
    for (const permCode of role.permissionCodes) {
      const perm = data.permissions.find((p) => p.code === permCode);
      if (perm) {
        await pool.query(
          `INSERT INTO role_permissions (id, role_id, permission_id, created_at)
           VALUES (gen_random_uuid(), $1, $2, NOW())`,
          [result.rows[0].id, perm.id],
        );
      }
    }
  }

  // 3. Users (one per role)
  const userDefs = [
    {
      key: 'admin' as const,
      email: 'admin-test@rimpay.test',
      fullName: 'Test Administrator',
      roleName: 'ADMIN',
      password: TEST_PASSWORDS.admin,
    },
    {
      key: 'programManager' as const,
      email: 'pm-test@rimpay.test',
      fullName: 'Test Program Manager',
      roleName: 'PROGRAM_MANAGER',
      password: TEST_PASSWORDS.programManager,
    },
    {
      key: 'supervisor' as const,
      email: 'supervisor-test@rimpay.test',
      fullName: 'Test Supervisor',
      roleName: 'SUPERVISOR',
      password: TEST_PASSWORDS.supervisor,
    },
    {
      key: 'agent' as const,
      email: 'agent-test@rimpay.test',
      fullName: 'Test Field Agent',
      roleName: 'AGENT',
      password: TEST_PASSWORDS.agent,
    },
    {
      key: 'auditor' as const,
      email: 'auditor-test@rimpay.test',
      fullName: 'Test Auditor',
      roleName: 'AUDITOR',
      password: TEST_PASSWORDS.auditor,
    },
  ];

  for (const userDef of userDefs) {
    const hash = await bcrypt.hash(userDef.password, BCRYPT_COST);
    const result = await pool.query(
      `INSERT INTO users (id, email, password_hash, full_name, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE', NOW(), NOW())
       RETURNING id`,
      [userDef.email, hash, userDef.fullName],
    );
    const userId = result.rows[0].id;
    data.users[userDef.key] = {
      id: userId,
      email: userDef.email,
      password: userDef.password,
    };

    const role = data.roles.find((r) => r.name === userDef.roleName);
    if (role) {
      await pool.query(
        `INSERT INTO user_roles (id, user_id, role_id, created_at)
         VALUES (gen_random_uuid(), $1, $2, NOW())`,
        [userId, role.id],
      );
    }
  }

  // 4. Geography (2 regions, 2 moughataas, 2 communes, 4 localities)
  const regionA = await pool.query(
    `INSERT INTO regions (id, name, code, created_at, updated_at)
     VALUES (gen_random_uuid(), 'Test Region Alpha', 'TEST-RGA', NOW(), NOW())
     RETURNING id, code, name`,
  );
  const regionB = await pool.query(
    `INSERT INTO regions (id, name, code, created_at, updated_at)
     VALUES (gen_random_uuid(), 'Test Region Beta', 'TEST-RGB', NOW(), NOW())
     RETURNING id, code, name`,
  );
  data.regions = [regionA.rows[0], regionB.rows[0]];

  const mougA = await pool.query(
    `INSERT INTO moughataas (id, name, code, region_id, created_at, updated_at)
     VALUES (gen_random_uuid(), 'Test Moughataa Alpha', 'TEST-MGA', $1, NOW(), NOW())
     RETURNING id, code, name`,
    [regionA.rows[0].id],
  );
  const mougB = await pool.query(
    `INSERT INTO moughataas (id, name, code, region_id, created_at, updated_at)
     VALUES (gen_random_uuid(), 'Test Moughataa Beta', 'TEST-MGB', $1, NOW(), NOW())
     RETURNING id, code, name`,
    [regionB.rows[0].id],
  );
  data.moughataas = [mougA.rows[0], mougB.rows[0]];

  const commA = await pool.query(
    `INSERT INTO communes (id, name, code, moughataa_id, created_at, updated_at)
     VALUES (gen_random_uuid(), 'Test Commune Alpha', 'TEST-CMA', $1, NOW(), NOW())
     RETURNING id, code, name`,
    [mougA.rows[0].id],
  );
  const commB = await pool.query(
    `INSERT INTO communes (id, name, code, moughataa_id, created_at, updated_at)
     VALUES (gen_random_uuid(), 'Test Commune Beta', 'TEST-CMB', $1, NOW(), NOW())
     RETURNING id, code, name`,
    [mougB.rows[0].id],
  );
  data.communes = [commA.rows[0], commB.rows[0]];

  const locA1 = await pool.query(
    `INSERT INTO localities (id, name, code, commune_id, created_at, updated_at)
     VALUES (gen_random_uuid(), 'Test Locality A1', 'TEST-LA1', $1, NOW(), NOW())
     RETURNING id, code, name`,
    [commA.rows[0].id],
  );
  const locA2 = await pool.query(
    `INSERT INTO localities (id, name, code, commune_id, created_at, updated_at)
     VALUES (gen_random_uuid(), 'Test Locality A2', 'TEST-LA2', $1, NOW(), NOW())
     RETURNING id, code, name`,
    [commA.rows[0].id],
  );
  const locB1 = await pool.query(
    `INSERT INTO localities (id, name, code, commune_id, created_at, updated_at)
     VALUES (gen_random_uuid(), 'Test Locality B1', 'TEST-LB1', $1, NOW(), NOW())
     RETURNING id, code, name`,
    [commB.rows[0].id],
  );
  const locB2 = await pool.query(
    `INSERT INTO localities (id, name, code, commune_id, created_at, updated_at)
     VALUES (gen_random_uuid(), 'Test Locality B2', 'TEST-LB2', $1, NOW(), NOW())
     RETURNING id, code, name`,
    [commB.rows[0].id],
  );
  data.localities = [locA1.rows[0], locA2.rows[0], locB1.rows[0], locB2.rows[0]];

  // 5. Social program
  const progResult = await pool.query(
    `INSERT INTO social_programs (id, name, code, type, institution, description, status, created_at, updated_at)
     VALUES (gen_random_uuid(), 'Test Program', 'TEST-PROG-001', 'CASH_TRANSFER', 'Test Institution', 'Test social program', 'ACTIVE', NOW(), NOW())
     RETURNING id, code, name`,
  );
  data.program = progResult.rows[0];

  // 6. Beneficiaries (10, all in locality A1)
  for (let i = 1; i <= 10; i++) {
    const nni = i <= 8 ? `TEST-NNI-${String(i).padStart(3, '0')}` : 'TEST-NNI-DUP';
    const result = await pool.query(
      `INSERT INTO beneficiaries (id, registry_code, full_name, nni, gender, locality_id, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'ACTIVE', NOW(), NOW())
       RETURNING id, registry_code AS "registryCode", full_name AS "fullName"`,
      [
        `TEST-RC-${String(i).padStart(3, '0')}`,
        `Test Beneficiary ${i}`,
        nni,
        i % 2 === 0 ? 'M' : 'F',
        locA1.rows[0].id,
      ],
    );
    data.beneficiaries.push(result.rows[0]);
  }

  // 7. Agent (linked to agent user)
  const agentResult = await pool.query(
    `INSERT INTO agents (id, user_id, phone, employee_code, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, '+22200000001', 'TEST-EMP-001', 'ACTIVE', NOW(), NOW())
     RETURNING id, user_id AS "userId", employee_code AS "employeeCode"`,
    [data.users.agent.id],
  );
  data.agent = agentResult.rows[0];

  // 8. Device (linked to agent)
  const deviceResult = await pool.query(
    `INSERT INTO devices (id, agent_id, device_uid, platform, model, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'TEST-DEVICE-UID-001', 'Android', 'Test Device', 'ACTIVE', NOW(), NOW())
     RETURNING id, device_uid AS "deviceUid"`,
    [data.agent.id],
  );
  data.device = deviceResult.rows[0];

  return data;
}
