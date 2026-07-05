import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  InclusionStatus,
  OperationStatus,
} from '../../../generated/prisma/client';

export class GeoSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  code?: string;
}

export type ScopeLevel =
  | 'NATIONAL'
  | 'REGION'
  | 'MOUGHATAA'
  | 'COMMUNE'
  | 'LOCALITY';

export class OperationScopeDto {
  @ApiProperty({
    enum: ['NATIONAL', 'REGION', 'MOUGHATAA', 'COMMUNE', 'LOCALITY'],
    example: 'REGION',
  })
  level: ScopeLevel;

  @ApiPropertyOptional({ type: GeoSummaryDto, nullable: true })
  region: GeoSummaryDto | null;

  @ApiPropertyOptional({ type: GeoSummaryDto, nullable: true })
  moughataa: GeoSummaryDto | null;

  @ApiPropertyOptional({ type: GeoSummaryDto, nullable: true })
  commune: GeoSummaryDto | null;

  @ApiPropertyOptional({ type: GeoSummaryDto, nullable: true })
  locality: GeoSummaryDto | null;
}

export class SocialProgramSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  code: string;
}

export class OperatorSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  code: string;
}

export class OperationListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'OP-2026-001' })
  code: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: OperationStatus })
  status: OperationStatus;

  @ApiPropertyOptional({ nullable: true })
  period: string | null;

  @ApiPropertyOptional({ nullable: true, example: '5000000.00' })
  plannedAmount: string | null;

  @ApiProperty({ example: '0.00' })
  paidAmount: string;

  @ApiProperty({ example: '0.00' })
  executionRate: string;

  @ApiProperty({ type: SocialProgramSummaryDto })
  socialProgram: SocialProgramSummaryDto;

  @ApiPropertyOptional({ type: OperatorSummaryDto, nullable: true })
  operator: OperatorSummaryDto | null;

  @ApiProperty({ type: OperationScopeDto })
  scope: OperationScopeDto;

  @ApiProperty({ example: 0 })
  assignedBeneficiariesCount: number;

  @ApiProperty()
  createdAt: Date;
}

export class BeneficiaryAssignmentSummaryDto {
  @ApiProperty({ example: 0 })
  total: number;

  @ApiProperty({
    description: 'Assignment counts keyed by inclusion status.',
    example: { INCLUDED: 0, EXCLUDED: 0, PENDING_REVIEW: 0, SUSPENDED: 0 },
  })
  byStatus: Record<string, number>;
}

export class PaymentSummaryDto {
  @ApiProperty({ example: 0 })
  total: number;

  @ApiProperty({ example: 0 })
  paid: number;

  @ApiProperty({ example: 0 })
  pending: number;

  @ApiPropertyOptional({ nullable: true })
  lastPaidAt: Date | null;
}

export class OperationDetailDto extends OperationListItemDto {
  @ApiPropertyOptional({ nullable: true })
  startDate: Date | null;

  @ApiPropertyOptional({ nullable: true })
  endDate: Date | null;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: BeneficiaryAssignmentSummaryDto })
  beneficiaryAssignmentSummary: BeneficiaryAssignmentSummaryDto;

  @ApiProperty({ type: PaymentSummaryDto })
  paymentSummary: PaymentSummaryDto;
}

export class PaginatedOperationsDto {
  @ApiProperty({ type: [OperationListItemDto] })
  data: OperationListItemDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 12 })
  total: number;

  @ApiProperty({ example: 1 })
  totalPages: number;
}

export class AssignmentResultItemDto {
  @ApiProperty()
  beneficiaryId: string;

  @ApiProperty({ enum: InclusionStatus })
  status: InclusionStatus;

  @ApiPropertyOptional({ nullable: true })
  plannedAmount: string | null;

  @ApiProperty({ example: false })
  alreadyAssigned: boolean;
}

export class AssignmentResponseDto {
  @ApiProperty({ example: 2 })
  assigned: number;

  @ApiProperty({ example: 1 })
  skippedDuplicates: number;

  @ApiProperty({ type: [AssignmentResultItemDto] })
  items: AssignmentResultItemDto[];
}
