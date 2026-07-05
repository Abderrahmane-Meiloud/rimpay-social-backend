import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class ImportBeneficiaryRowDto {
  @ApiPropertyOptional({
    description:
      'Unique registry code. Auto-generated (BEN-YYYYMMDD-XXXXXX) if omitted.',
    example: 'BEN-001',
  })
  @IsOptional()
  @IsString()
  registryCode?: string;

  @ApiProperty({ example: 'Nom fictif' })
  @IsString()
  fullName: string;

  @ApiPropertyOptional({
    description: 'National ID number. Used for duplicate detection.',
    example: '1234567890',
  })
  @IsOptional()
  @IsString()
  nni?: string;

  @ApiPropertyOptional({ example: '+22200000000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    description: 'Locality the beneficiary belongs to. Must exist.',
    example: '00000000-0000-0000-0000-000000000000',
  })
  @IsUUID()
  localityId: string;

  @ApiPropertyOptional({ example: '1990-05-12', format: 'date' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;
}

export class ImportBeneficiariesDto {
  @ApiProperty({ type: [ImportBeneficiaryRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ImportBeneficiaryRowDto)
  beneficiaries: ImportBeneficiaryRowDto[];
}
