import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

// status, paidAmount and executionRate are intentionally NOT accepted on
// create: a new operation always starts as DRAFT with system-managed amounts.
export class CreatePaymentOperationDto {
  @ApiProperty({ description: 'Parent social program. Must exist.' })
  @IsUUID()
  socialProgramId: string;

  @ApiPropertyOptional({
    description: 'Operator assigned to execute this operation. Must exist and be ACTIVE.',
  })
  @IsOptional()
  @IsUUID()
  operatorId?: string;

  @ApiProperty({ example: 'OP-PNS-2026-Q1' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Unique operation code.', example: 'OP-2026-001' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ example: '2026-Q1' })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiPropertyOptional({
    description: 'Geographic scope: at most one level may be set.',
  })
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
