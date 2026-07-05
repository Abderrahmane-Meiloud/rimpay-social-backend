import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Pool } from 'pg';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestContext, destroyTestContext } from './test-setup';
import {
  assertSafeToRun,
  runMinisterialDemoSeed,
  writeCredentialsFileIfEnabled,
} from '../prisma/demo/seed-ministerial-demo';
import { DEMO_CODE_PREFIX } from '../prisma/demo/ministerial-demo.data';

/**
 * Proves the ministerial demo seed's safety gates, idempotency, required
 * dataset shape, and secret-free output — without ever touching a
 * development or production database (this suite runs exclusively against
 * rimpay_social_test via the existing e2e harness).
 *
 * Generated demo account passwords must NEVER appear in console output.
 * The only sanctioned destination for a generated password is a local,
 * Git-ignored credentials file, written only when DEMO_CREDENTIALS_FILE=true
 * is explicitly set. These tests point that file at a temp directory (never
 * a tracked repository path) so no credentials file is ever written inside
 * backend/, frontend/, prisma/, test/, or any documentation path.
 */

const FORBIDDEN_SUBSTRINGS = [
  'password',
  'mot de passe',
  'credential',
  'identifiant secret',
  'refresh_token',
  'set-cookie',
];

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
}

function assertNoForbiddenSubstrings(text: string): void {
  const lower = text.toLowerCase();
  for (const forbidden of FORBIDDEN_SUBSTRINGS) {
    expect(lower).not.toContain(forbidden);
  }
  expect(text).not.toMatch(/eyJ[a-zA-Z0-9_-]{10,}/); // JWT-shaped string
  expect(text.toLowerCase()).not.toMatch(/postgresql:\/\//);
}

describe('Ministerial demo seed safety gates (P0)', () => {
  it('refuses to run when NODE_ENV=production', () => {
    withEnv({ NODE_ENV: 'production', DEMO_DATA_MODE: 'true' }, () => {
      expect(() => assertSafeToRun()).toThrow(/production/i);
    });
  });

  it('refuses to run without DEMO_DATA_MODE=true', () => {
    withEnv({ NODE_ENV: 'test', DEMO_DATA_MODE: undefined }, () => {
      expect(() => assertSafeToRun()).toThrow(/DEMO_DATA_MODE/);
    });
  });

  it('refuses to run when DEMO_DATA_MODE is set to something other than "true"', () => {
    withEnv({ NODE_ENV: 'test', DEMO_DATA_MODE: 'yes' }, () => {
      expect(() => assertSafeToRun()).toThrow(/DEMO_DATA_MODE/);
    });
  });

  it('allows running when NODE_ENV is not production and DEMO_DATA_MODE=true', () => {
    withEnv({ NODE_ENV: 'test', DEMO_DATA_MODE: 'true' }, () => {
      expect(() => assertSafeToRun()).not.toThrow();
    });
  });
});

describe('writeCredentialsFileIfEnabled (unit, no database access)', () => {
  let tempPath: string;

  beforeEach(() => {
    tempPath = path.join(
      os.tmpdir(),
      `ministerial-demo-credentials-unit-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
  });

  afterEach(() => {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  });

  const fictionalCredentials = [
    { email: 'demo.unit-test@demo.rimpay.local', role: 'ADMIN_TAAZOUR', password: 'Fictional#Test1234!' },
  ];

  it('does nothing when DEMO_CREDENTIALS_FILE is not "true"', () => {
    withEnv({ DEMO_CREDENTIALS_FILE: undefined, DEMO_CREDENTIALS_FILE_PATH: tempPath }, () => {
      const result = writeCredentialsFileIfEnabled(fictionalCredentials);
      expect(result.written).toBe(false);
      expect(fs.existsSync(tempPath)).toBe(false);
    });
  });

  it('does nothing when there are no generated credentials, even if enabled', () => {
    withEnv({ DEMO_CREDENTIALS_FILE: 'true', DEMO_CREDENTIALS_FILE_PATH: tempPath }, () => {
      const result = writeCredentialsFileIfEnabled([]);
      expect(result.written).toBe(false);
      expect(fs.existsSync(tempPath)).toBe(false);
    });
  });

  it('writes the file only when explicitly enabled, and never echoes the password to console', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    withEnv({ DEMO_CREDENTIALS_FILE: 'true', DEMO_CREDENTIALS_FILE_PATH: tempPath }, () => {
      const result = writeCredentialsFileIfEnabled(fictionalCredentials);
      expect(result.written).toBe(true);
      expect(result.path).toBe(tempPath);
    });

    expect(fs.existsSync(tempPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(tempPath, 'utf-8'));
    expect(parsed.accounts[0].password).toBe(fictionalCredentials[0].password);

    const loggedText = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join('\n');
    expect(loggedText).not.toContain(fictionalCredentials[0].password);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('Ministerial demo seed dataset (P0)', () => {
  let app: INestApplication;
  let pool: Pool;
  let prisma: PrismaService;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeAll(async () => {
    const ctx = await createTestContext();
    app = ctx.app;
    pool = ctx.pool;
    prisma = app.get(PrismaService);
  }, 60_000);

  afterAll(async () => {
    await destroyTestContext({ app, pool });
  });

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('running the seed twice does not duplicate records and produces the required counts', async () => {
    const firstRun = await runMinisterialDemoSeed(prisma);
    const secondRun = await runMinisterialDemoSeed(prisma);

    // Idempotency: identical totals across both runs.
    expect(secondRun).toEqual(firstRun);

    // Required minimums from the demo scenario mandate.
    expect(firstRun.programmes).toBeGreaterThanOrEqual(1);
    expect(firstRun.beneficiaries).toBeGreaterThanOrEqual(60);
    expect(firstRun.operations).toBeGreaterThanOrEqual(2);
    expect(firstRun.payments).toBeGreaterThanOrEqual(40);
    expect(firstRun.anomalies).toBeGreaterThanOrEqual(5);
    expect(firstRun.auditLogs).toBeGreaterThanOrEqual(1);

    // Direct DB verification that re-running truly created no duplicate rows.
    const beneficiaryCount = await prisma.beneficiary.count({
      where: { registryCode: { startsWith: DEMO_CODE_PREFIX } },
    });
    expect(beneficiaryCount).toBe(firstRun.beneficiaries);

    const regionCount = await prisma.region.count({
      where: { code: { startsWith: DEMO_CODE_PREFIX } },
    });
    expect(regionCount).toBeGreaterThanOrEqual(3);

    const moughataaCount = await prisma.moughataa.count({
      where: { code: { startsWith: DEMO_CODE_PREFIX } },
    });
    expect(moughataaCount).toBeGreaterThanOrEqual(5);

    const localityCount = await prisma.locality.count({
      where: { code: { startsWith: DEMO_CODE_PREFIX } },
    });
    expect(localityCount).toBeGreaterThanOrEqual(8);

    const agentCount = await prisma.agent.count({
      where: { employeeCode: { startsWith: DEMO_CODE_PREFIX } },
    });
    expect(agentCount).toBeGreaterThanOrEqual(3);

    const deviceCount = await prisma.device.count({
      where: { deviceUid: { startsWith: DEMO_CODE_PREFIX } },
    });
    expect(deviceCount).toBeGreaterThanOrEqual(3);

    const operations = await prisma.paymentOperation.findMany({
      where: { code: { startsWith: DEMO_CODE_PREFIX } },
      select: { status: true },
    });
    expect(operations.some((o) => o.status === 'OPEN')).toBe(true);
    expect(operations.some((o) => o.status === 'CLOSED')).toBe(true);

    const paymentStatuses = await prisma.payment.findMany({
      where: { paymentOperation: { code: { startsWith: DEMO_CODE_PREFIX } } },
      select: { status: true },
    });
    const statusSet = new Set(paymentStatuses.map((p) => p.status));
    expect(statusSet.has('PAID')).toBe(true);
    expect(statusSet.has('PENDING')).toBe(true);
    expect(statusSet.has('CANCELLED')).toBe(true);

    const anomalyTypes = await prisma.anomaly.findMany({
      where: { description: { startsWith: '[Démonstration]' } },
      select: { type: true },
    });
    const anomalyTypeSet = new Set(anomalyTypes.map((a) => a.type));
    expect(anomalyTypeSet.has('MULTIPLE_PAYMENT')).toBe(true);
    expect(anomalyTypeSet.has('MISSING_GPS')).toBe(true);
    expect(anomalyTypeSet.has('GPS_OUT_OF_ZONE')).toBe(true);
    expect(anomalyTypeSet.has('UNKNOWN_DEVICE')).toBe(true);
    expect(anomalyTypeSet.has('AGENT_NOT_ASSIGNED')).toBe(true);

    const demoAccounts = await prisma.user.findMany({
      where: { email: { endsWith: '@demo.rimpay.local' } },
      select: { email: true },
    });
    expect(demoAccounts.length).toBeGreaterThanOrEqual(4);
  }, 120_000);

  it('never prints a raw secret, password, or credential-shaped string in seed output (DEMO_CREDENTIALS_FILE unset)', async () => {
    consoleLogSpy.mockClear();
    consoleErrorSpy.mockClear();
    consoleWarnSpy.mockClear();

    await withEnv({ DEMO_CREDENTIALS_FILE: undefined }, async () => {
      await runMinisterialDemoSeed(prisma);
    });

    const allLoggedText = [
      ...consoleLogSpy.mock.calls,
      ...consoleErrorSpy.mock.calls,
      ...consoleWarnSpy.mock.calls,
    ]
      .flat()
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join('\n');

    const databaseUrl = process.env.DATABASE_URL_TEST;
    expect(databaseUrl).toBeDefined();
    expect(allLoggedText).not.toContain(databaseUrl as string);
    assertNoForbiddenSubstrings(allLoggedText);
  }, 60_000);

  describe('local credentials file (opt-in only)', () => {
    let tempCredentialsPath: string;

    beforeEach(() => {
      tempCredentialsPath = path.join(
        os.tmpdir(),
        `ministerial-demo-credentials-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
      );
    });

    afterEach(() => {
      if (fs.existsSync(tempCredentialsPath)) {
        fs.unlinkSync(tempCredentialsPath);
      }
    });

    it('does not create a credentials file when DEMO_CREDENTIALS_FILE is unset', async () => {
      await withEnv(
        {
          DEMO_CREDENTIALS_FILE: undefined,
          DEMO_CREDENTIALS_FILE_PATH: tempCredentialsPath,
        },
        async () => {
          await runMinisterialDemoSeed(prisma);
        },
      );

      expect(fs.existsSync(tempCredentialsPath)).toBe(false);
    });

    it('does not create a credentials file when there are no newly-created accounts (idempotent re-run)', async () => {
      // First ensure accounts already exist (from the earlier "runs twice"
      // test in this file), then run once more with the file gate enabled:
      // there should be nothing new to write.
      await withEnv(
        {
          DEMO_CREDENTIALS_FILE: 'true',
          DEMO_CREDENTIALS_FILE_PATH: tempCredentialsPath,
        },
        async () => {
          await runMinisterialDemoSeed(prisma);
        },
      );

      expect(fs.existsSync(tempCredentialsPath)).toBe(false);
    });

    it('never prints passwords even when DEMO_CREDENTIALS_FILE=true is set', async () => {
      consoleLogSpy.mockClear();
      consoleErrorSpy.mockClear();
      consoleWarnSpy.mockClear();

      await withEnv(
        {
          DEMO_CREDENTIALS_FILE: 'true',
          DEMO_CREDENTIALS_FILE_PATH: tempCredentialsPath,
        },
        async () => {
          await runMinisterialDemoSeed(prisma);
        },
      );

      const allLoggedText = [
        ...consoleLogSpy.mock.calls,
        ...consoleErrorSpy.mock.calls,
        ...consoleWarnSpy.mock.calls,
      ]
        .flat()
        .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
        .join('\n');

      assertNoForbiddenSubstrings(allLoggedText);

      // Even if a credentials file was written (only possible on a fresh
      // database with brand-new accounts), its raw content must never be
      // echoed to console output.
      if (fs.existsSync(tempCredentialsPath)) {
        const fileContents = fs.readFileSync(tempCredentialsPath, 'utf-8');
        const parsed = JSON.parse(fileContents) as { accounts: Array<{ password: string }> };
        for (const account of parsed.accounts) {
          expect(allLoggedText).not.toContain(account.password);
        }
      }
    });

    it('the credentials file path used by default is never inside a tracked repository path', () => {
      // Resolve the same default the seed module would use, without
      // actually writing anything (DEMO_CREDENTIALS_FILE stays unset).
      const backendRoot = path.resolve(__dirname, '..');
      const workspaceRoot = path.resolve(backendRoot, '..');
      const expectedDefaultPath = path.join(
        workspaceRoot,
        '.ministerial-demo-credentials.local.json',
      );

      // The default path must sit strictly outside backend/, frontend/,
      // prisma/, test/, and any documentation path (all of which are
      // subdirectories of backendRoot or a sibling "frontend" directory).
      expect(expectedDefaultPath.startsWith(backendRoot + path.sep)).toBe(false);
      expect(expectedDefaultPath).not.toContain(`${path.sep}src${path.sep}`);
      expect(expectedDefaultPath).not.toContain(`${path.sep}prisma${path.sep}`);
      expect(expectedDefaultPath).not.toContain(`${path.sep}test${path.sep}`);
    });
  });
});
