import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { DashboardPeriod } from '../dashboard/dashboard.service';
import { ReportsService } from './reports.service';
import { PaymentSummaryExportService } from './payment-summary-export.service';
import { ReportQueryDto } from './dto/report-query.dto';

const VALID_PERIODS: ReadonlySet<string> = new Set([
  'LAST_3_MONTHS',
  'LAST_6_MONTHS',
  'LAST_12_MONTHS',
  'CURRENT_YEAR',
]);

const VALID_FORMATS: ReadonlySet<string> = new Set(['pdf', 'xlsx']);

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly exportService: PaymentSummaryExportService,
  ) {}

  @Get('catalog')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get available report types catalog' })
  getCatalog() {
    return this.reportsService.getCatalog();
  }

  @Get('payment-summary/export')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Export payment summary as PDF or Excel' })
  @ApiQuery({ name: 'format', required: true, enum: ['pdf', 'xlsx'] })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['LAST_3_MONTHS', 'LAST_6_MONTHS', 'LAST_12_MONTHS', 'CURRENT_YEAR'],
  })
  async exportPaymentSummary(
    @Query('format') format: string,
    @Query('period') period: string | undefined,
    @Res() res: Response,
  ) {
    if (!format || !VALID_FORMATS.has(format)) {
      throw new BadRequestException(
        `Invalid format: ${format}. Allowed values: ${[...VALID_FORMATS].join(', ')}`,
      );
    }
    const effectivePeriod = period || 'LAST_12_MONTHS';
    if (!VALID_PERIODS.has(effectivePeriod)) {
      throw new BadRequestException(
        `Invalid period: ${effectivePeriod}. Allowed values: ${[...VALID_PERIODS].join(', ')}`,
      );
    }

    const analytics = await this.exportService.getAnalytics(
      effectivePeriod as DashboardPeriod,
    );
    const now = new Date();
    const generatedAt = now.toLocaleString('fr-FR', { timeZone: 'UTC' });
    const dateSlug = now.toISOString().slice(0, 10);

    if (format === 'pdf') {
      const buffer = await this.exportService.generatePdf(analytics, generatedAt);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="rimpay-rapport-paiements-${dateSlug}.pdf"`,
        'Content-Length': buffer.length,
      });
      res.end(buffer);
    } else {
      const buffer = await this.exportService.generateXlsx(analytics, generatedAt);
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="rimpay-rapport-paiements-${dateSlug}.xlsx"`,
        'Content-Length': buffer.length,
      });
      res.end(buffer);
    }
  }

  @Get()
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'List generated reports' })
  findAll(@Query() query: ReportQueryDto) {
    return this.reportsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get a single report with details' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.reportsService.findOne(id);
  }
}
