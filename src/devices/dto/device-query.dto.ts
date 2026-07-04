import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { DeviceStatus } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class DeviceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Free-text search over device UID, platform, and model.',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: DeviceStatus })
  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus;

  @ApiPropertyOptional({ description: 'Filter devices belonging to this agent.' })
  @IsOptional()
  @IsUUID()
  agentId?: string;
}
