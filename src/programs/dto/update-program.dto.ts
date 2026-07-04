import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
} from 'class-validator';
import { SocialProgramStatus } from '../../../generated/prisma/client';

// code is intentionally NOT updatable: it is the immutable program identity.
// id/createdAt/deletedAt are never accepted from the client.
export class UpdateProgramDto {
  @ApiPropertyOptional({ example: 'Programme National de Solidarité' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ example: 'CASH_TRANSFER' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 'Ministère des Affaires Sociales' })
  @IsOptional()
  @IsString()
  institution?: string;

  @ApiPropertyOptional({ example: 'Updated description.' })
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

  @ApiPropertyOptional({ example: '15000000.00' })
  @IsOptional()
  @IsNumberString()
  budgetAmount?: string;

  @ApiPropertyOptional({
    enum: SocialProgramStatus,
    description: 'Program activation is done by setting status DRAFT -> ACTIVE.',
    example: SocialProgramStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(SocialProgramStatus)
  status?: SocialProgramStatus;
}
