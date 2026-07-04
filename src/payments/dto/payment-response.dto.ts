import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PaymentStatus,
  SyncStatus,
  BeneficiaryStatus,
  OperationStatus,
  SocialProgramStatus,
} from '../../../generated/prisma/client';

export class GeoSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  code: string;
}

// Lean beneficiary summary used in list rows. NNI is intentionally omitted
// here to limit PII exposure in bulk listings.
export class BeneficiaryListSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'BEN-20260611-AB12CD' })
  registryCode: string;

  @ApiProperty({ example: 'Fatimetou Mint Sidi' })
  fullName: string;
}

// Fuller beneficiary summary used in the detail view (behind payments.read).
export class BeneficiaryDetailSummaryDto extends BeneficiaryListSummaryDto {
  @ApiPropertyOptional({ example: '1234567890', nullable: true })
  nni?: string | null;

  @ApiProperty({ enum: BeneficiaryStatus })
  status: BeneficiaryStatus;
}

export class OperationSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'OP-2026-001' })
  code: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: OperationStatus })
  status: OperationStatus;
}

export class OperationDetailSummaryDto extends OperationSummaryDto {
  @ApiPropertyOptional({ nullable: true })
  period: string | null;
}

export class SocialProgramSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  name: string;
}

export class SocialProgramDetailSummaryDto extends SocialProgramSummaryDto {
  @ApiProperty({ enum: SocialProgramStatus })
  status: SocialProgramStatus;
}

export class PaymentGeographyDto {
  @ApiPropertyOptional({ type: GeoSummaryDto, nullable: true })
  region: GeoSummaryDto | null;

  @ApiPropertyOptional({ type: GeoSummaryDto, nullable: true })
  moughataa: GeoSummaryDto | null;

  @ApiPropertyOptional({ type: GeoSummaryDto, nullable: true })
  commune: GeoSummaryDto | null;

  @ApiProperty({ type: GeoSummaryDto })
  locality: GeoSummaryDto;
}

export class PaymentListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: '5000.00' })
  amount: string;

  @ApiProperty({ enum: PaymentStatus })
  status: PaymentStatus;

  @ApiProperty({ enum: SyncStatus })
  syncStatus: SyncStatus;

  @ApiPropertyOptional({ nullable: true })
  plannedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  paidAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  cancelledAt: Date | null;

  @ApiProperty({ type: BeneficiaryListSummaryDto })
  beneficiary: BeneficiaryListSummaryDto;

  @ApiProperty({ type: OperationSummaryDto })
  operation: OperationSummaryDto;

  @ApiProperty({ type: SocialProgramSummaryDto })
  socialProgram: SocialProgramSummaryDto;

  @ApiProperty({ type: GeoSummaryDto })
  locality: GeoSummaryDto;

  @ApiProperty()
  createdAt: Date;
}

export class PaginatedPaymentsDto {
  @ApiProperty({ type: [PaymentListItemDto] })
  data: PaymentListItemDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 137 })
  total: number;

  @ApiProperty({ example: 7 })
  totalPages: number;
}

export class PaymentStatusHistoryItemDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional({ enum: PaymentStatus, nullable: true })
  fromStatus: PaymentStatus | null;

  @ApiProperty({ enum: PaymentStatus })
  toStatus: PaymentStatus;

  @ApiPropertyOptional({ nullable: true })
  reason: string | null;

  @ApiPropertyOptional({ nullable: true })
  changedBy: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class PaymentValidationSummaryDto {
  @ApiProperty({ example: 0 })
  total: number;

  @ApiProperty({ example: 0 })
  accepted: number;

  @ApiProperty({ example: 0 })
  rejected: number;

  @ApiProperty({ example: 0 })
  attempted: number;

  @ApiPropertyOptional({ nullable: true })
  lastValidatedAt: Date | null;
}

export class PaymentAnomalySummaryDto {
  @ApiProperty({ example: 0 })
  open: number;

  @ApiProperty({ example: 0 })
  total: number;
}

export class PaymentDetailDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: '5000.00' })
  amount: string;

  @ApiProperty({ enum: PaymentStatus })
  status: PaymentStatus;

  @ApiProperty({ enum: SyncStatus })
  syncStatus: SyncStatus;

  @ApiPropertyOptional({ nullable: true })
  plannedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  paidAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  cancelledAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: BeneficiaryDetailSummaryDto })
  beneficiary: BeneficiaryDetailSummaryDto;

  @ApiProperty({ type: PaymentGeographyDto })
  geography: PaymentGeographyDto;

  @ApiProperty({ type: OperationDetailSummaryDto })
  operation: OperationDetailSummaryDto;

  @ApiProperty({ type: SocialProgramDetailSummaryDto })
  socialProgram: SocialProgramDetailSummaryDto;

  @ApiProperty({ type: [PaymentStatusHistoryItemDto] })
  recentStatusHistory: PaymentStatusHistoryItemDto[];

  @ApiProperty({ type: PaymentValidationSummaryDto })
  validationSummary: PaymentValidationSummaryDto;

  @ApiProperty({ type: PaymentAnomalySummaryDto })
  anomalySummary: PaymentAnomalySummaryDto;
}
