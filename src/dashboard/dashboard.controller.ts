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
  getSummary(@Query('period') period?: string) {
    if (period !== undefined && !VALID_PERIODS.has(period)) {
      throw new BadRequestException(
        `Invalid period: ${period}. Allowed values: ${[...VALID_PERIODS].join(', ')}`,
      );
    }
    return this.dashboardService.getSummary(period as DashboardPeriod | undefined);
  }
}
