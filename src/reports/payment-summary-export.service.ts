import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DashboardService, DashboardPeriod } from '../dashboard/dashboard.service';
import { AnalyticsDto } from '../dashboard/dto/dashboard-summary-response.dto';
import PDFDocument = require('pdfkit');
import * as ExcelJS from 'exceljs';

const FRENCH_MONTHS: Record<string, string> = {
  '01': 'Janvier', '02': 'Février', '03': 'Mars', '04': 'Avril',
  '05': 'Mai', '06': 'Juin', '07': 'Juillet', '08': 'Août',
  '09': 'Septembre', '10': 'Octobre', '11': 'Novembre', '12': 'Décembre',
};

const VALID_AMOUNT_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function assertValidAmount(amount: string, context: string): void {
  if (typeof amount !== 'string' || !VALID_AMOUNT_PATTERN.test(amount)) {
    throw new InternalServerErrorException(
      `Invalid monetary value in ${context} — cannot generate institutional report with corrupt data`,
    );
  }
}

function assertValidCount(count: number, context: string): void {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new InternalServerErrorException(
      `Invalid payment count in ${context} — cannot generate institutional report with corrupt data`,
    );
  }
}

function frenchMonth(yyyymm: string): string {
  if (!yyyymm || yyyymm.length < 7) return yyyymm || '';
  const [y, m] = yyyymm.split('-');
  return `${FRENCH_MONTHS[m] || m} ${y}`;
}

function formatMRU(amount: string): string {
  if (amount === '0') return '0 MRU';
  const parts = amount.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const fracPart = parts[1];
  return fracPart ? `${intPart},${fracPart} MRU` : `${intPart} MRU`;
}

function formatNumber(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function safeExcelNumber(amount: string): number | string {
  if (amount === '0') return 0;
  if (amount.includes('.')) return formatMRU(amount);
  const n = Number(amount);
  if (Number.isSafeInteger(n)) return n;
  return formatMRU(amount);
}

@Injectable()
export class PaymentSummaryExportService {
  constructor(private readonly dashboardService: DashboardService) {}

  async getAnalytics(period: DashboardPeriod): Promise<AnalyticsDto> {
    return this.dashboardService.computeAnalytics(period);
  }

  private validateReportData(analytics: AnalyticsDto): void {
    assertValidAmount(analytics.periodTotals.totalAmountPaid, 'periodTotals');
    assertValidCount(analytics.periodTotals.paidPayments, 'periodTotals');
    for (const r of analytics.paymentsByRegion) {
      assertValidAmount(r.totalAmountPaid, `region "${r.regionName}"`);
      assertValidCount(r.paidPayments, `region "${r.regionName}"`);
    }
    for (const m of analytics.paymentsByMonth) {
      assertValidAmount(m.totalAmountPaid, `month "${m.month}"`);
      assertValidCount(m.paidPayments, `month "${m.month}"`);
    }
  }

  async generatePdf(analytics: AnalyticsDto, generatedAt: string): Promise<Buffer> {
    this.validateReportData(analytics);

    const M = 50;
    const PW = 595.28;
    const CW = PW - 2 * M;
    const CONTENT_TOP = M;
    const CONTENT_BOTTOM = 710;
    const FOOTER_Y = 742;
    const PAGENUM_Y = 756;

    const H_INST_TITLE = 24;
    const H_REPORT_TITLE = 18;
    const H_INFO_LINE = 14;
    const H_SECTION_TITLE = 18;
    const H_TABLE_HEADER = 20;
    const H_ROW = 14;
    const H_GAP_SMALL = 6;
    const H_GAP_MEDIUM = 12;
    const H_GAP_SECTION = 18;

    const HEADER_H = H_INST_TITLE + H_GAP_SMALL + H_REPORT_TITLE + H_GAP_SMALL
      + H_INFO_LINE + H_INFO_LINE + H_GAP_MEDIUM;
    const SUMMARY_H = H_SECTION_TITLE + H_GAP_SMALL + H_INFO_LINE + H_INFO_LINE + H_GAP_MEDIUM;
    const REGION_TITLE_H = H_SECTION_TITLE + H_GAP_SMALL;
    const MONTH_TITLE_H = H_SECTION_TITLE + H_GAP_SMALL;

    const regionData = analytics.paymentsByRegion;
    const monthData = analytics.paymentsByMonth;
    const regionCount = regionData.length;
    const monthCount = monthData.length;

    type PageBlock =
      | { kind: 'header' }
      | { kind: 'summary' }
      | { kind: 'regionTitle'; continuation: boolean }
      | { kind: 'regionTableHeader' }
      | { kind: 'regionRow'; index: number }
      | { kind: 'sectionGap' }
      | { kind: 'monthTitle'; continuation: boolean }
      | { kind: 'monthTableHeader' }
      | { kind: 'monthRow'; index: number }
      | { kind: 'emptyRegion' }
      | { kind: 'emptyMonth' };

    function blockHeight(b: PageBlock): number {
      switch (b.kind) {
        case 'header': return HEADER_H;
        case 'summary': return SUMMARY_H;
        case 'regionTitle': return REGION_TITLE_H;
        case 'monthTitle': return MONTH_TITLE_H;
        case 'regionTableHeader': case 'monthTableHeader': return H_TABLE_HEADER;
        case 'regionRow': case 'monthRow': return H_ROW;
        case 'sectionGap': return H_GAP_SECTION;
        case 'emptyRegion': case 'emptyMonth': return H_INFO_LINE;
      }
    }

    const allBlocks: PageBlock[] = [];
    allBlocks.push({ kind: 'header' });
    allBlocks.push({ kind: 'summary' });
    allBlocks.push({ kind: 'regionTitle', continuation: false });
    if (regionCount === 0) {
      allBlocks.push({ kind: 'emptyRegion' });
    } else {
      allBlocks.push({ kind: 'regionTableHeader' });
      for (let i = 0; i < regionCount; i++) allBlocks.push({ kind: 'regionRow', index: i });
    }
    allBlocks.push({ kind: 'sectionGap' });
    allBlocks.push({ kind: 'monthTitle', continuation: false });
    if (monthCount === 0) {
      allBlocks.push({ kind: 'emptyMonth' });
    } else {
      allBlocks.push({ kind: 'monthTableHeader' });
      for (let i = 0; i < monthCount; i++) allBlocks.push({ kind: 'monthRow', index: i });
    }

    const pageCapacity = CONTENT_BOTTOM - CONTENT_TOP;
    const pages: PageBlock[][] = [];
    let currentPageBlocks: PageBlock[] = [];
    let usedOnPage = 0;

    for (const block of allBlocks) {
      const h = blockHeight(block);
      if (currentPageBlocks.length > 0 && usedOnPage + h > pageCapacity) {
        pages.push(currentPageBlocks);
        currentPageBlocks = [];
        usedOnPage = 0;
        if (block.kind === 'regionRow') {
          const titleBlock: PageBlock = { kind: 'regionTitle', continuation: true };
          const hdrBlock: PageBlock = { kind: 'regionTableHeader' };
          currentPageBlocks.push(titleBlock, hdrBlock);
          usedOnPage += blockHeight(titleBlock) + blockHeight(hdrBlock);
        } else if (block.kind === 'monthRow') {
          const titleBlock: PageBlock = { kind: 'monthTitle', continuation: true };
          const hdrBlock: PageBlock = { kind: 'monthTableHeader' };
          currentPageBlocks.push(titleBlock, hdrBlock);
          usedOnPage += blockHeight(titleBlock) + blockHeight(hdrBlock);
        }
      }
      currentPageBlocks.push(block);
      usedOnPage += h;
    }
    if (currentPageBlocks.length > 0) pages.push(currentPageBlocks);

    const totalPages = pages.length;
    const colX = [M, 250, 360];

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: M, autoFirstPage: false });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      function textAt(x: number, y: number, txt: string, opts: object = {}) {
        doc.text(txt, x, y, { lineBreak: false, width: CW, ...opts });
      }

      function drawFooter(pageNum: number) {
        doc.save();
        doc.fontSize(8).font('Helvetica').fillColor('#6B7280');
        doc.x = M;
        doc.y = FOOTER_Y;
        textAt(M, FOOTER_Y, 'Document généré par RIMPay Social — PNRSCS', { align: 'center' });
        doc.x = M;
        doc.y = PAGENUM_Y;
        textAt(M, PAGENUM_Y, `Page ${pageNum} / ${totalPages}`, { align: 'center' });
        doc.restore();
      }

      function drawTableHeaderAt(y: number, headers: string[]): number {
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000');
        headers.forEach((h, i) => {
          doc.text(h, colX[i], y, { lineBreak: false, width: (colX[i + 1] || PW - M) - colX[i] });
        });
        const lineY = y + 13;
        doc.moveTo(M, lineY).lineTo(PW - M, lineY).strokeColor('#000000').stroke();
        return y + H_TABLE_HEADER;
      }

      function drawRowAt(y: number, cells: string[]): number {
        doc.fontSize(9).font('Helvetica').fillColor('#000000');
        cells.forEach((c, i) => {
          doc.text(c, colX[i], y, { lineBreak: false, width: (colX[i + 1] || PW - M) - colX[i] });
        });
        return y + H_ROW;
      }

      for (let p = 0; p < pages.length; p++) {
        doc.addPage({ size: 'A4', margin: M });
        let y = CONTENT_TOP;

        for (const block of pages[p]) {
          switch (block.kind) {
            case 'header':
              doc.fontSize(18).font('Helvetica-Bold').fillColor('#000000');
              textAt(M, y, 'RIMPay Social — PNRSCS', { align: 'center' });
              y += H_INST_TITLE + H_GAP_SMALL;
              doc.fontSize(14).font('Helvetica-Bold');
              textAt(M, y, 'Rapport de synthèse des paiements sociaux', { align: 'center' });
              y += H_REPORT_TITLE + H_GAP_SMALL;
              doc.fontSize(10).font('Helvetica');
              textAt(M, y, `Période : ${analytics.period.label} (${analytics.period.startDate} — ${analytics.period.endDate})`, { align: 'center' });
              y += H_INFO_LINE;
              textAt(M, y, `Généré le : ${generatedAt}`, { align: 'center' });
              y += H_INFO_LINE + H_GAP_MEDIUM;
              break;

            case 'summary':
              doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000');
              textAt(M, y, 'Synthèse');
              y += H_SECTION_TITLE + H_GAP_SMALL;
              doc.fontSize(10).font('Helvetica');
              textAt(M, y, `Paiements effectués : ${formatNumber(analytics.periodTotals.paidPayments)}`);
              y += H_INFO_LINE;
              textAt(M, y, `Montant total distribué : ${formatMRU(analytics.periodTotals.totalAmountPaid)}`);
              y += H_INFO_LINE + H_GAP_MEDIUM;
              break;

            case 'regionTitle':
              doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000');
              textAt(M, y, block.continuation ? 'Répartition régionale — suite' : 'Répartition régionale');
              y += REGION_TITLE_H;
              break;

            case 'monthTitle':
              doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000');
              textAt(M, y, block.continuation ? 'Évolution mensuelle — suite' : 'Évolution mensuelle');
              y += MONTH_TITLE_H;
              break;

            case 'regionTableHeader':
              y = drawTableHeaderAt(y, ['Région', 'Paiements', 'Montant']);
              break;

            case 'monthTableHeader':
              y = drawTableHeaderAt(y, ['Mois', 'Paiements', 'Montant']);
              break;

            case 'regionRow': {
              const r = regionData[block.index];
              y = drawRowAt(y, [r.regionName, formatNumber(r.paidPayments), formatMRU(r.totalAmountPaid)]);
              break;
            }

            case 'monthRow': {
              const m = monthData[block.index];
              y = drawRowAt(y, [frenchMonth(m.month), formatNumber(m.paidPayments), formatMRU(m.totalAmountPaid)]);
              break;
            }

            case 'emptyRegion':
              doc.fontSize(10).font('Helvetica').fillColor('#000000');
              textAt(M, y, 'Aucune donnée régionale disponible.');
              y += H_INFO_LINE;
              break;

            case 'emptyMonth':
              doc.fontSize(10).font('Helvetica').fillColor('#000000');
              textAt(M, y, 'Aucune donnée mensuelle disponible.');
              y += H_INFO_LINE;
              break;

            case 'sectionGap':
              y += H_GAP_SECTION;
              break;
          }
        }

        drawFooter(p + 1);
      }

      doc.end();
    });
  }

  async generateXlsx(analytics: AnalyticsDto, generatedAt: string): Promise<Buffer> {
    this.validateReportData(analytics);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RIMPay Social — PNRSCS';
    workbook.created = new Date();

    const headerStyle: Partial<ExcelJS.Style> = {
      font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2DBE6C' } },
      alignment: { horizontal: 'center' },
    };

    const ws1 = workbook.addWorksheet('Synthèse');
    ws1.columns = [
      { header: 'Paramètre', key: 'param', width: 35 },
      { header: 'Valeur', key: 'value', width: 40 },
    ];
    ws1.getRow(1).eachCell((cell) => { cell.style = headerStyle as ExcelJS.Style; });
    ws1.addRow({ param: 'Période', value: analytics.period.label });
    ws1.addRow({ param: 'Date de début', value: analytics.period.startDate });
    ws1.addRow({ param: 'Date de fin', value: analytics.period.endDate });
    ws1.addRow({ param: 'Date de génération', value: generatedAt });
    ws1.addRow({ param: 'Paiements effectués', value: analytics.periodTotals.paidPayments });
    ws1.addRow({ param: 'Montant total distribué', value: formatMRU(analytics.periodTotals.totalAmountPaid) });
    ws1.views = [{ state: 'frozen', ySplit: 1 }];

    const ws2 = workbook.addWorksheet('Répartition régionale');
    ws2.columns = [
      { header: 'Région', key: 'region', width: 30 },
      { header: 'Paiements effectués', key: 'payments', width: 22 },
      { header: 'Montant distribué (MRU)', key: 'amount', width: 28 },
    ];
    ws2.getRow(1).eachCell((cell) => { cell.style = headerStyle as ExcelJS.Style; });
    for (const r of analytics.paymentsByRegion) {
      ws2.addRow({
        region: r.regionName,
        payments: r.paidPayments,
        amount: safeExcelNumber(r.totalAmountPaid),
      });
    }
    if (analytics.paymentsByRegion.length === 0) {
      ws2.addRow({ region: 'Aucune donnée', payments: 0, amount: '0 MRU' });
    }
    ws2.views = [{ state: 'frozen', ySplit: 1 }];

    const ws3 = workbook.addWorksheet('Évolution mensuelle');
    ws3.columns = [
      { header: 'Mois', key: 'month', width: 22 },
      { header: 'Paiements effectués', key: 'payments', width: 22 },
      { header: 'Montant distribué (MRU)', key: 'amount', width: 28 },
    ];
    ws3.getRow(1).eachCell((cell) => { cell.style = headerStyle as ExcelJS.Style; });
    for (const m of analytics.paymentsByMonth) {
      ws3.addRow({
        month: frenchMonth(m.month),
        payments: m.paidPayments,
        amount: safeExcelNumber(m.totalAmountPaid),
      });
    }
    ws3.views = [{ state: 'frozen', ySplit: 1 }];

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
