import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
} from 'class-validator';
import { SocialProgramStatus } from '../../../generated/prisma/client';

export class CreateProgramDto {
  @ApiProperty({ example: 'Programme National de Solidarité' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Unique program code.',
    example: 'PNS-2026',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ example: 'CASH_TRANSFER' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 'Ministère des Affaires Sociales' })
  @IsOptional()
  @IsString()
  institution?: string;

  @ApiPropertyOptional({ example: 'Quarterly cash transfer program.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '2026-01-01', format: 'date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31', format: 'date' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Total program budget (decimal as string).',
    example: '15000000.00',
  })
  @IsOptional()
  @IsNumberString()
  budgetAmount?: string;

  @ApiPropertyOptional({
    enum: SocialProgramStatus,
    default: SocialProgramStatus.DRAFT,
    example: SocialProgramStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(SocialProgramStatus)
  status?: SocialProgramStatus;
}
