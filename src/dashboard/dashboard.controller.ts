import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { DashboardService, DashboardPeriod } from './dashboard.service';

const VALID_PERIODS: ReadonlySet<string> = new Set([
  'LAST_3_MONTHS',
  'LAST_6_MONTHS',
  'LAST_12_MONTHS',
  'CURRENT_YEAR',
]);

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get aggregated dashboard statistics with optional analytics period' })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['LAST_3_MONTHS', 'LAST_6_MONTHS', 'LAST_12_MONTHS', 'CURRENT_YEAR'],
    description: 'Analytics period filter. Default: LAST_12_MONTHS',
  })
  @ApiQuery({
    name: 'scenario',
    required: false,
    enum: ['MINISTERIAL_DEMO'],
    description:
      'Optional dataset scope. When set to MINISTERIAL_DEMO, statistics are restricted to ' +
      'programs/operations seeded by the ministerial demo (code prefix MDEMO-), excluding ' +
      'unrelated development/test data.',
  })
  getSummary(@Query('period') period?: string, @Query('scenario') scenario?: string) {
    if (period !== undefined && !VALID_PERIODS.has(period)) {
      throw new BadRequestException(
        `Invalid period: ${period}. Allowed values: ${[...VALID_PERIODS].join(', ')}`,
      );
    }
    if (scenario !== undefined && scenario !== 'MINISTERIAL_DEMO') {
      throw new BadRequestException(
        `Invalid scenario: ${scenario}. Allowed values: MINISTERIAL_DEMO`,
      );
    }
    return this.dashboardService.getSummary(
      period as DashboardPeriod | undefined,
      scenario === 'MINISTERIAL_DEMO',
    );
  }
}
