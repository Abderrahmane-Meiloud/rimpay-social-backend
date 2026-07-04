import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PaymentStatus, SyncStatus } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class PaymentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Free-text search over beneficiary full name, registry code and NNI.',
    example: 'Fatimetou',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: SyncStatus })
  @IsOptional()
  @IsEnum(SyncStatus)
  syncStatus?: SyncStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  paymentOperationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  beneficiaryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  socialProgramId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  regionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  moughataaId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  communeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  localityId?: string;

  @ApiPropertyOptional({
    description: 'Filter payments whose plannedAt is >= this date.',
    example: '2026-01-01',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Filter payments whose plannedAt is <= this date.',
    example: '2026-12-31',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
