import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { BeneficiaryStatus } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class BeneficiaryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Free-text search over full name, NNI and registry code.',
    example: 'Fatimetou',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: '1234567890' })
  @IsOptional()
  @IsString()
  nni?: string;

  @ApiPropertyOptional({ example: '+22222000000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: BeneficiaryStatus })
  @IsOptional()
  @IsEnum(BeneficiaryStatus)
  status?: BeneficiaryStatus;

  @ApiPropertyOptional({ description: 'Filter by locality id.' })
  @IsOptional()
  @IsUUID()
  localityId?: string;

  @ApiPropertyOptional({ description: 'Filter by commune id.' })
  @IsOptional()
  @IsUUID()
  communeId?: string;

  @ApiPropertyOptional({ description: 'Filter by moughataa id.' })
  @IsOptional()
  @IsUUID()
  moughataaId?: string;

  @ApiPropertyOptional({ description: 'Filter by region id.' })
  @IsOptional()
  @IsUUID()
  regionId?: string;
}
