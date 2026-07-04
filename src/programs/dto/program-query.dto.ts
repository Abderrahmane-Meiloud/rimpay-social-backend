import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SocialProgramStatus } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ProgramQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Free-text search over name and code.',
    example: 'Solidarité',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'PNS-2026' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ enum: SocialProgramStatus })
  @IsOptional()
  @IsEnum(SocialProgramStatus)
  status?: SocialProgramStatus;

  @ApiPropertyOptional({ example: 'CASH_TRANSFER' })
  @IsOptional()
  @IsString()
  type?: string;
}
