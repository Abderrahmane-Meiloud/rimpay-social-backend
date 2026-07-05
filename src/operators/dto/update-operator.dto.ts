import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// code is intentionally NOT updatable: it is the immutable operator identity.
// status is changed only via PATCH /operators/:id/status.
export class UpdateOperatorDto {
  @ApiPropertyOptional({ example: 'Opérateur Nord' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ example: 'DISTRIBUTION' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 'Société Opérateur Nord SARL' })
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiPropertyOptional({ example: 'Amina Sow' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactName?: string;

  @ApiPropertyOptional({ example: '+22220000000' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPhone?: string;

  @ApiPropertyOptional({ example: 'contact@operateur-nord.mr' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}
