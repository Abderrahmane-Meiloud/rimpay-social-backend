import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BeneficiaryStatus, ContactType } from '../../../generated/prisma/client';

export class GeoSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  code?: string;
}

export class PrimaryContactSummaryDto {
  @ApiProperty({ example: '+22222000000' })
  phone: string;

  @ApiPropertyOptional({ example: 'Mohamed Ould Ahmed' })
  ownerName?: string | null;
}

export class DuplicateWarningDto {
  @ApiProperty({ example: true })
  nni: boolean;

  @ApiProperty({ example: false })
  phone: boolean;
}

export class BeneficiaryListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'BEN-20260611-AB12CD' })
  registryCode: string;

  @ApiProperty({ example: 'Fatimetou Mint Sidi' })
  fullName: string;

  @ApiPropertyOptional({ example: '1234567890' })
  nni?: string | null;

  @ApiProperty({ enum: BeneficiaryStatus })
  status: BeneficiaryStatus;

  @ApiProperty({ type: GeoSummaryDto })
  locality: GeoSummaryDto;

  @ApiProperty({ type: GeoSummaryDto })
  commune: GeoSummaryDto;

  @ApiProperty({ type: GeoSummaryDto })
  moughataa: GeoSummaryDto;

  @ApiProperty({ type: GeoSummaryDto })
  region: GeoSummaryDto;

  @ApiPropertyOptional({ type: PrimaryContactSummaryDto, nullable: true })
  primaryContact: PrimaryContactSummaryDto | null;

  @ApiProperty()
  createdAt: Date;
}

export class PaginatedBeneficiariesDto {
  @ApiProperty({ type: [BeneficiaryListItemDto] })
  data: BeneficiaryListItemDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 137 })
  total: number;

  @ApiProperty({ example: 7 })
  totalPages: number;
}

export class ContactDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ContactType })
  type: ContactType;

  @ApiProperty({ example: '+22222000000' })
  phone: string;

  @ApiPropertyOptional({ nullable: true })
  ownerName?: string | null;

  @ApiProperty({ example: false })
  isVerified: boolean;
}

export class DocumentDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  fileReference: string;

  @ApiPropertyOptional({ nullable: true })
  notes?: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class HistorySummaryDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional({ nullable: true })
  reason?: string | null;

  @ApiPropertyOptional({ nullable: true })
  changedById?: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class AnomaliesSummaryDto {
  @ApiProperty({ example: 0 })
  open: number;

  @ApiProperty({ example: 0 })
  total: number;
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

export class BeneficiaryDetailDto extends BeneficiaryListItemDto {
  @ApiPropertyOptional({ nullable: true })
  gender?: string | null;

  @ApiPropertyOptional({ nullable: true })
  birthDate?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  source?: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes?: string | null;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: [ContactDto] })
  contacts: ContactDto[];

  @ApiProperty({ type: [DocumentDto] })
  documents: DocumentDto[];

  @ApiProperty({ type: [HistorySummaryDto] })
  recentHistories: HistorySummaryDto[];

  @ApiProperty({ type: AnomaliesSummaryDto })
  anomaliesSummary: AnomaliesSummaryDto;

  @ApiProperty({ type: PaymentSummaryDto })
  paymentSummary: PaymentSummaryDto;
}

export class BeneficiaryMutationResponseDto extends BeneficiaryDetailDto {
  @ApiPropertyOptional({
    type: DuplicateWarningDto,
    description:
      'Non-blocking potential-duplicate warnings. Anomaly records are NOT ' +
      'created in this phase.',
  })
  duplicateWarnings?: DuplicateWarningDto;
}
