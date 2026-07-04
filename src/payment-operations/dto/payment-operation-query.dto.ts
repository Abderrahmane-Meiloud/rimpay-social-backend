import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { OperationStatus } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class PaymentOperationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Free-text search over name and code.',
    example: 'OP-2026',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'OP-2026-001' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ enum: OperationStatus })
  @IsOptional()
  @IsEnum(OperationStatus)
  status?: OperationStatus;

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
    description: 'Filter operations whose startDate is >= this date.',
    example: '2026-01-01',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter operations whose startDate is <= this date.',
    example: '2026-12-31',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
