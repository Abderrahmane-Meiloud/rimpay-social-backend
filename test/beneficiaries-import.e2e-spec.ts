import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { createTestContext, destroyTestContext } from './test-setup';
import { getTokens, TokenSet } from './test-auth-helper';
import { TestFixtureData } from './fixtures';
import { roles } from '../prisma/seed/data/roles.data';

describe('Beneficiary import — ADMIN_TAAZOUR-only bulk import (INSTITUTIONAL-RBAC-2-FIX-2)', () => {
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

  // ================================================================
  // Permission model
  // ================================================================
  describe('beneficiaries.import permission model', () => {
    it('ADMIN_TAAZOUR holds beneficiaries.import', () => {
      const admin = roles.find((r) => r.name === 'ADMIN_TAAZOUR');
      expect(admin!.permissionCodes).toContain('beneficiaries.import');
    });

    it('PROGRAMME does not hold beneficiaries.import', () => {
      const programme = roles.find((r) => r.name === 'PROGRAMME');
      expect(programme!.permissionCodes).not.toContain('beneficiaries.import');
    });

    it('OPERATOR does not hold beneficiaries.import', () => {
      const operator = roles.find((r) => r.name === 'OPERATOR');
      expect(operator!.permissionCodes).not.toContain('beneficiaries.import');
    });

    it('AGENT does not hold beneficiaries.import', () => {
      const agent = roles.find((r) => r.name === 'AGENT');
      expect(agent!.permissionCodes).not.toContain('beneficiaries.import');
    });
  });

  // ================================================================
  // Admin-only enforcement (API level)
  // ================================================================
  describe('POST /beneficiaries/import — role enforcement', () => {
    it('ADMIN_TAAZOUR can import beneficiaries', async () => {
      const res = await request(app.getHttpServer())
        .post('/beneficiaries/import')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          beneficiaries: [
            {
              registryCode: 'IMPORT-BEN-001',
              fullName: 'Nom fictif Un',
              nni: 'IMPORT-NNI-001',
              phone: '+22200000001',
              localityId: fixtures.localities[0].id,
            },
            {
              registryCode: 'IMPORT-BEN-002',
              fullName: 'Nom fictif Deux',
              nni: 'IMPORT-NNI-002',
              localityId: fixtures.localities[0].id,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.created).toBe(2);
      expect(res.body.skipped).toBe(0);
      expect(res.body.invalid).toBe(0);
      expect(JSON.stringify(res.body)).not.toContain('IMPORT-NNI-001');
    });

    it('PROGRAMME cannot import beneficiaries (403)', async () => {
      const res = await request(app.getHttpServer())
        .post('/beneficiaries/import')
        .set('Authorization', `Bearer ${tokens.programme}`)
        .send({
          beneficiaries: [
            {
              registryCode: 'IMPORT-BEN-PROG-001',
              fullName: 'Should Not Be Created',
              localityId: fixtures.localities[0].id,
            },
          ],
        });
      expect(res.status).toBe(403);

      const check = await pool.query(
        `SELECT id FROM beneficiaries WHERE registry_code = 'IMPORT-BEN-PROG-001'`,
      );
      expect(check.rows).toHaveLength(0);
    });

    it('OPERATOR cannot import beneficiaries (403)', async () => {
      const res = await request(app.getHttpServer())
        .post('/beneficiaries/import')
        .set('Authorization', `Bearer ${tokens.operator}`)
        .send({
          beneficiaries: [
            {
              registryCode: 'IMPORT-BEN-OPR-001',
              fullName: 'Should Not Be Created',
              localityId: fixtures.localities[0].id,
            },
          ],
        });
      expect(res.status).toBe(403);

      const check = await pool.query(
        `SELECT id FROM beneficiaries WHERE registry_code = 'IMPORT-BEN-OPR-001'`,
      );
      expect(check.rows).toHaveLength(0);
    });

    it('AGENT cannot import beneficiaries (403)', async () => {
      const res = await request(app.getHttpServer())
        .post('/beneficiaries/import')
        .set('Authorization', `Bearer ${tokens.agent}`)
        .send({
          beneficiaries: [
            {
              registryCode: 'IMPORT-BEN-AGT-001',
              fullName: 'Should Not Be Created',
              localityId: fixtures.localities[0].id,
            },
          ],
        });
      expect(res.status).toBe(403);

      const check = await pool.query(
        `SELECT id FROM beneficiaries WHERE registry_code = 'IMPORT-BEN-AGT-001'`,
      );
      expect(check.rows).toHaveLength(0);
    });

    it('unauthenticated request cannot import beneficiaries (401)', async () => {
      const res = await request(app.getHttpServer())
        .post('/beneficiaries/import')
        .send({
          beneficiaries: [
            {
              registryCode: 'IMPORT-BEN-ANON-001',
              fullName: 'Should Not Be Created',
              localityId: fixtures.localities[0].id,
            },
          ],
        });
      expect(res.status).toBe(401);
    });
  });

  // ================================================================
  // Duplicate handling
  // ================================================================
  describe('duplicate handling', () => {
    it('skips a row whose registryCode already exists, without creating a duplicate', async () => {
      const existingCode = fixtures.beneficiaries[0].registryCode;

      const res = await request(app.getHttpServer())
        .post('/beneficiaries/import')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          beneficiaries: [
            {
              registryCode: existingCode,
              fullName: 'Duplicate Attempt',
              localityId: fixtures.localities[0].id,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.created).toBe(0);
      expect(res.body.skipped).toBe(1);
      expect(res.body.errors[0].reason).toMatch(/registryCode already exists/);

      const check = await pool.query(
        `SELECT id FROM beneficiaries WHERE registry_code = $1`,
        [existingCode],
      );
      expect(check.rows).toHaveLength(1);
    });

    it('skips a row whose nni already exists among active beneficiaries', async () => {
      const existingNni = 'TEST-NNI-001';

      const res = await request(app.getHttpServer())
        .post('/beneficiaries/import')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          beneficiaries: [
            {
              registryCode: 'IMPORT-BEN-DUPNNI-001',
              fullName: 'Duplicate NNI Attempt',
              nni: existingNni,
              localityId: fixtures.localities[0].id,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.created).toBe(0);
      expect(res.body.skipped).toBe(1);
      expect(res.body.errors[0].reason).toMatch(/nni already exists/);
      expect(JSON.stringify(res.body)).not.toContain(existingNni);
    });

    it('handles duplicate registryCode/nni within the same batch idempotently (only the first row is created)', async () => {
      const res = await request(app.getHttpServer())
        .post('/beneficiaries/import')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          beneficiaries: [
            {
              registryCode: 'IMPORT-BEN-BATCHDUP-001',
              fullName: 'Batch Row One',
              nni: 'IMPORT-NNI-BATCHDUP-001',
              localityId: fixtures.localities[0].id,
            },
            {
              registryCode: 'IMPORT-BEN-BATCHDUP-001',
              fullName: 'Batch Row Two (same registryCode)',
              localityId: fixtures.localities[0].id,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.created).toBe(1);
      expect(res.body.skipped).toBe(1);

      const check = await pool.query(
        `SELECT id FROM beneficiaries WHERE registry_code = 'IMPORT-BEN-BATCHDUP-001'`,
      );
      expect(check.rows).toHaveLength(1);
    });
  });

  // ================================================================
  // Invalid row handling
  // ================================================================
  describe('invalid row handling', () => {
    it('rejects a row missing fullName (aggregate response, not a global 400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/beneficiaries/import')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          beneficiaries: [
            {
              registryCode: 'IMPORT-BEN-INVALID-001',
              fullName: '',
              localityId: fixtures.localities[0].id,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.created).toBe(0);
      expect(res.body.invalid).toBe(1);
      expect(res.body.errors[0].reason).toMatch(/fullName is required/);

      const check = await pool.query(
        `SELECT id FROM beneficiaries WHERE registry_code = 'IMPORT-BEN-INVALID-001'`,
      );
      expect(check.rows).toHaveLength(0);
    });

    it('rejects a row with an invalid localityId at the row level (aggregate response, not a global 400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/beneficiaries/import')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          beneficiaries: [
            {
              registryCode: 'IMPORT-BEN-BADLOC-001',
              fullName: 'Bad Locality',
              localityId: '00000000-0000-0000-0000-000000000000',
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.created).toBe(0);
      expect(res.body.invalid).toBe(1);
      expect(res.body.errors[0].reason).toMatch(/Invalid localityId/);
    });

    it('rejects the whole payload when the beneficiaries array is empty', async () => {
      const res = await request(app.getHttpServer())
        .post('/beneficiaries/import')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ beneficiaries: [] });

      expect(res.status).toBe(400);
    });

    it('processes valid and invalid rows independently in the same batch', async () => {
      const res = await request(app.getHttpServer())
        .post('/beneficiaries/import')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          beneficiaries: [
            {
              registryCode: 'IMPORT-BEN-MIXED-001',
              fullName: 'Valid Row',
              localityId: fixtures.localities[0].id,
            },
            {
              registryCode: 'IMPORT-BEN-MIXED-002',
              fullName: '',
              localityId: fixtures.localities[0].id,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.created).toBe(1);
      expect(res.body.invalid).toBe(1);

      const check = await pool.query(
        `SELECT registry_code FROM beneficiaries WHERE registry_code = 'IMPORT-BEN-MIXED-001'`,
      );
      expect(check.rows).toHaveLength(1);
    });
  });

  // ================================================================
  // Sensitive data handling
  // ================================================================
  describe('sensitive data handling', () => {
    it('import response never contains a raw NNI list', async () => {
      const res = await request(app.getHttpServer())
        .post('/beneficiaries/import')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          beneficiaries: [
            {
              registryCode: 'IMPORT-BEN-NNICHECK-001',
              fullName: 'NNI Check',
              nni: 'IMPORT-NNI-SENSITIVE-001',
              localityId: fixtures.localities[0].id,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body).not.toHaveProperty('beneficiaries');
      expect(res.body).not.toHaveProperty('nni');
      expect(JSON.stringify(res.body)).not.toContain('IMPORT-NNI-SENSITIVE-001');
      expect(Object.keys(res.body).sort()).toEqual(
        ['created', 'skipped', 'invalid', 'errors'].sort(),
      );
    });
  });

  // ================================================================
  // Imported rows are normal system records, not demo records
  // ================================================================
  describe('imported beneficiaries are normal (non-demo) records', () => {
    it('the imported beneficiary is a real ACTIVE record with source=import, not a demo record', async () => {
      const registryCode = 'IMPORT-BEN-REALCHECK-001';
      await request(app.getHttpServer())
        .post('/beneficiaries/import')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          beneficiaries: [
            {
              registryCode,
              fullName: 'Real Import Check',
              localityId: fixtures.localities[0].id,
            },
          ],
        })
        .expect(201);

      const check = await pool.query(
        `SELECT status, source, full_name AS "fullName" FROM beneficiaries WHERE registry_code = $1`,
        [registryCode],
      );
      expect(check.rows).toHaveLength(1);
      expect(check.rows[0].status).toBe('ACTIVE');
      expect(check.rows[0].source).toBe('import');
      expect(check.rows[0].fullName).not.toMatch(/Demo/i);
    });

    it('the normal seed does not load demo beneficiaries (regression guard)', async () => {
      const res = await pool.query(
        `SELECT registry_code FROM beneficiaries WHERE registry_code LIKE 'DEMO-%' OR full_name LIKE '%Demo%'`,
      );
      expect(res.rows).toHaveLength(0);
    });
  });
});
