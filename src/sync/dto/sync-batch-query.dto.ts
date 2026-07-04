import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { SyncBatchStatus } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class SyncBatchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SyncBatchStatus })
  @IsOptional()
  @IsEnum(SyncBatchStatus)
  status?: SyncBatchStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @ApiPropertyOptional({ format: 'date', description: 'Filter batches created on or after this date.' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date', description: 'Filter batches created on or before this date.' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
