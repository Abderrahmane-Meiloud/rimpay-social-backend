import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { InclusionStatus } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class AssignedBeneficiariesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: InclusionStatus })
  @IsOptional()
  @IsEnum(InclusionStatus)
  status?: InclusionStatus;
}
