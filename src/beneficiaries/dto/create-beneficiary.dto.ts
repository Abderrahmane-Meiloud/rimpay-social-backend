import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { BeneficiaryStatus } from '../../../generated/prisma/client';
import { CreateBeneficiaryContactDto } from './create-beneficiary-contact.dto';

export class CreateBeneficiaryDto {
  @ApiProperty({ example: 'Fatimetou Mint Sidi' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({
    description: 'Locality the beneficiary belongs to. Must exist.',
    example: '00000000-0000-0000-0000-000000000000',
  })
  @IsUUID()
  localityId: string;

  @ApiPropertyOptional({
    description:
      'Unique registry code. Auto-generated (BEN-YYYYMMDD-XXXXXX) if omitted.',
    example: 'BEN-20260611-AB12CD',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  registryCode?: string;

  @ApiPropertyOptional({
    description: 'National ID number. Not required to be unique.',
    example: '1234567890',
  })
  @IsOptional()
  @IsString()
  nni?: string;

  @ApiPropertyOptional({ example: 'F' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ example: '1990-05-12', format: 'date' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ example: 'national-registry-import' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ example: 'Imported from 2026 registry.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    enum: BeneficiaryStatus,
    default: BeneficiaryStatus.ACTIVE,
    example: BeneficiaryStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(BeneficiaryStatus)
  status?: BeneficiaryStatus;

  @ApiPropertyOptional({ type: CreateBeneficiaryContactDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateBeneficiaryContactDto)
  primaryContact?: CreateBeneficiaryContactDto;
}
