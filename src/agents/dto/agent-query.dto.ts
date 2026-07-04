import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { AgentStatus } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class AgentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Free-text search over employee code, phone, and linked user full name / email.',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: AgentStatus })
  @IsOptional()
  @IsEnum(AgentStatus)
  status?: AgentStatus;

  @ApiPropertyOptional({ description: 'Filter agents with an active assignment in this region.' })
  @IsOptional()
  @IsUUID()
  regionId?: string;

  @ApiPropertyOptional({ description: 'Filter agents with an active assignment in this moughataa.' })
  @IsOptional()
  @IsUUID()
  moughataaId?: string;

  @ApiPropertyOptional({ description: 'Filter agents with an active assignment in this commune.' })
  @IsOptional()
  @IsUUID()
  communeId?: string;

  @ApiPropertyOptional({ description: 'Filter agents with an active assignment in this locality.' })
  @IsOptional()
  @IsUUID()
  localityId?: string;
}
