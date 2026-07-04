import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import {
  AnomalySeverity,
  AnomalyStatus,
  AnomalyType,
} from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class AnomalyQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AnomalyStatus })
  @IsOptional()
  @IsEnum(AnomalyStatus)
  status?: AnomalyStatus;

  @ApiPropertyOptional({ enum: AnomalyType })
  @IsOptional()
  @IsEnum(AnomalyType)
  type?: AnomalyType;

  @ApiPropertyOptional({ enum: AnomalySeverity })
  @IsOptional()
  @IsEnum(AnomalySeverity)
  severity?: AnomalySeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  beneficiaryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  paymentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  paymentOperationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  syncBatchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({ description: 'ISO date string (from)' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'ISO date string (to)' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
