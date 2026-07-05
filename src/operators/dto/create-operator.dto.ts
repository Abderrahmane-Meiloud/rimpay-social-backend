import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// status is intentionally NOT accepted on create: a new operator always
// starts as ACTIVE. Use PATCH /operators/:id/status to change it.
export class CreateOperatorDto {
  @ApiProperty({ example: 'Opérateur Démonstration Nord' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Unique operator code.', example: 'OP-NORD-01' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ example: 'DISTRIBUTION' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 'Société Démonstration Nord SARL' })
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

  @ApiPropertyOptional({ example: 'contact@operateur-nord-demo.test' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}
