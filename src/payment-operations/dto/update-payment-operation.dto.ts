import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

// code and socialProgramId are immutable. status (use open/close endpoints),
// paidAmount and executionRate (system-computed) are never client-updatable.
// Geography scope changes are allowed but still subject to the one-scope rule
// and the DRAFT/SUSPENDED editability guard enforced in the service.
export class UpdatePaymentOperationDto {
  @ApiPropertyOptional({ example: 'OP-PNS-2026-Q1' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ example: '2026-Q1' })
  @IsOptional()
  @IsString()
  period?: string;

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

  @ApiPropertyOptional({ example: '5000000.00' })
  @IsOptional()
  @IsNumberString()
  plannedAmount?: string;

  @ApiPropertyOptional({ example: '2026-01-15', format: 'date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-03-31', format: 'date' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
