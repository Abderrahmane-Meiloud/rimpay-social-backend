import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { GeoAssignmentStatus } from '../../../generated/prisma/client';

export class UpdateAgentGeographicAssignmentDto {
  @ApiPropertyOptional({ enum: GeoAssignmentStatus })
  @IsOptional()
  @IsEnum(GeoAssignmentStatus)
  status?: GeoAssignmentStatus;

  @ApiPropertyOptional({ format: 'date-time', example: '2026-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
