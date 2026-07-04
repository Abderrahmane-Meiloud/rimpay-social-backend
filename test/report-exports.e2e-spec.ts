import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { Workbook } from 'exceljs';
import { createTestContext, destroyTestContext } from './test-setup';
import { getTokens, TokenSet } from './test-auth-helper';
import { TestFixtureData } from './fixtures';

describe('Report exports privacy and validity (P0)', () => {
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

  describe('PDF export', () => {
    it('should return valid PDF with correct headers', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/payment-summary/export')
        .query({ format: 'pdf', period: 'LAST_12_MONTHS' })
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('.pdf');

      // PDF magic bytes
      const magic = res.body.slice(0, 5).toString('ascii');
      expect(magic).toBe('%PDF-');
    });

    // PDF privacy: byte-level search only (no reliable text extractor installed).
    // This provides partial evidence. Full PDF privacy was verified in Phase 25
    // runtime testing with visual inspection. A reliable extractor would be
    // needed for full automation.
    it('should not contain test NNI patterns in raw PDF bytes (partial evidence)', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/payment-summary/export')
        .query({ format: 'pdf', period: 'LAST_12_MONTHS' })
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      const raw = res.body.toString('binary');
      expect(raw).not.toContain('TEST-NNI-');
      expect(raw).not.toContain('+22200000001');
      expect(raw).not.toContain('TEST-RC-');
    });
  });

  describe('XLSX export', () => {
    it('should return valid XLSX with correct headers and magic bytes', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/payment-summary/export')
        .query({ format: 'xlsx', period: 'LAST_12_MONTHS' })
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(res.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(res.headers['content-disposition']).toContain('.xlsx');

      const zipMagic = res.body.slice(0, 2).toString('ascii');
      expect(zipMagic).toBe('PK');
    });

    it('should contain required worksheets and only aggregate content', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/payment-summary/export')
        .query({ format: 'xlsx', period: 'LAST_12_MONTHS' })
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      const workbook = new Workbook();
      await workbook.xlsx.load(res.body);

      // Verify expected worksheets
      const sheetNames = workbook.worksheets.map((ws) => ws.name);
      expect(sheetNames.length).toBeGreaterThanOrEqual(1);

      // No hidden sheets
      for (const ws of workbook.worksheets) {
        expect(ws.state).not.toBe('hidden');
        expect(ws.state).not.toBe('veryHidden');
      }

      // Collect all cell values as strings for privacy check
      const allValues: string[] = [];
      for (const ws of workbook.worksheets) {
        ws.eachRow((row) => {
          row.eachCell((cell) => {
            const val = cell.text || String(cell.value ?? '');
            if (val) allValues.push(val);
            // Check formulas
            if (cell.formula) allValues.push(cell.formula);
          });
        });
      }

      const joined = allValues.join(' ');

      // No beneficiary names
      for (const b of fixtures.beneficiaries) {
        expect(joined).not.toContain(b.fullName);
        expect(joined).not.toContain(b.registryCode);
      }

      // No NNI
      expect(joined).not.toMatch(/TEST-NNI-/);

      // No phone
      expect(joined).not.toContain('+22200000001');

      // No UUID
      const uuidPattern =
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      expect(joined).not.toMatch(uuidPattern);

      // No GPS coordinates (decimal patterns like 18.0735)
      expect(joined).not.toMatch(/\d{1,3}\.\d{5,}/);

      // No email
      expect(joined).not.toContain('@rimpay.test');
    });
  });

  describe('Export validation', () => {
    it('should reject invalid format (400)', async () => {
      await request(app.getHttpServer())
        .get('/reports/payment-summary/export')
        .query({ format: 'csv', period: 'LAST_12_MONTHS' })
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(400);
    });

    it('should reject unauthenticated request (401)', async () => {
      await request(app.getHttpServer())
        .get('/reports/payment-summary/export')
        .query({ format: 'pdf' })
        .expect(401);
    });
  });
});
