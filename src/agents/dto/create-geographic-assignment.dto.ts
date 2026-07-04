import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class CreateAgentGeographicAssignmentDto {
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

  @ApiPropertyOptional({ format: 'date-time', example: '2026-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ format: 'date-time', example: '2026-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
