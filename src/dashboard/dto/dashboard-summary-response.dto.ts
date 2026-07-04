import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StatusCountDto {
  @ApiProperty()
  status: string;

  @ApiProperty()
  count: number;
}

export class SeverityCountDto {
  @ApiProperty()
  severity: string;

  @ApiProperty()
  count: number;
}

export class RecentOperationDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  executionRate: string;

  @ApiProperty({ nullable: true })
  programName: string | null;

  @ApiProperty({ nullable: true })
  regionName: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class PeriodInfoDto {
  @ApiProperty()
  key: string;

  @ApiProperty()
  label: string;

  @ApiProperty()
  startDate: string;

  @ApiProperty()
  endDate: string;
}

export class PeriodTotalsDto {
  @ApiProperty()
  paidPayments: number;

  @ApiProperty()
  totalAmountPaid: string;
}

export class RegionBeneficiaryDto {
  @ApiProperty()
  regionCode: string;

  @ApiProperty()
  regionName: string;

  @ApiProperty()
  activeBeneficiaries: number;
}

export class RegionPaymentDto {
  @ApiProperty()
  regionCode: string;

  @ApiProperty()
  regionName: string;

  @ApiProperty()
  paidPayments: number;

  @ApiProperty()
  totalAmountPaid: string;
}

export class MonthPaymentDto {
  @ApiProperty({ example: '2026-03' })
  month: string;

  @ApiProperty()
  paidPayments: number;

  @ApiProperty()
  totalAmountPaid: string;
}

export class AnalyticsDto {
  @ApiProperty({ type: PeriodInfoDto })
  period: PeriodInfoDto;

  @ApiProperty({ type: PeriodTotalsDto })
  periodTotals: PeriodTotalsDto;

  @ApiProperty({ type: [RegionBeneficiaryDto] })
  beneficiariesByRegion: RegionBeneficiaryDto[];

  @ApiProperty({ type: [RegionPaymentDto] })
  paymentsByRegion: RegionPaymentDto[];

  @ApiProperty({ type: [MonthPaymentDto] })
  paymentsByMonth: MonthPaymentDto[];
}

export class DashboardSummaryResponseDto {
  @ApiProperty()
  beneficiariesTotal: number;

  @ApiProperty()
  activeBeneficiaries: number;

  @ApiProperty()
  programsTotal: number;

  @ApiProperty()
  operationsTotal: number;

  @ApiProperty()
  openOperations: number;

  @ApiProperty()
  paymentsTotal: number;

  @ApiProperty()
  paidPayments: number;

  @ApiProperty()
  pendingPayments: number;

  @ApiProperty()
  totalAmountPaid: string;

  @ApiProperty({ description: 'Sum of plannedAmount across in-scope operations.' })
  totalAmountPlanned: string;

  @ApiProperty({
    description:
      'Execution rate percentage (0-100), computed server-side as totalAmountPaid / ' +
      'totalAmountPlanned, consistent with the same scope used for both sums.',
  })
  executionRate: number;

  @ApiProperty()
  anomaliesTotal: number;

  @ApiProperty()
  openAnomalies: number;

  @ApiProperty()
  agentsTotal: number;

  @ApiProperty()
  activeAgents: number;

  @ApiProperty({ type: [StatusCountDto] })
  paymentsByStatus: StatusCountDto[];

  @ApiProperty({ type: [StatusCountDto] })
  operationsByStatus: StatusCountDto[];

  @ApiProperty({ type: [SeverityCountDto] })
  anomaliesBySeverity: SeverityCountDto[];

  @ApiProperty({ type: [RecentOperationDto] })
  operationsRecent: RecentOperationDto[];

  @ApiPropertyOptional({ type: AnalyticsDto })
  analytics?: AnalyticsDto;
}
