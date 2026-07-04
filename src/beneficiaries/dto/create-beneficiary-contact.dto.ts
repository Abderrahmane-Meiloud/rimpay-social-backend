import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ContactType } from '../../../generated/prisma/client';

export class CreateBeneficiaryContactDto {
  @ApiProperty({ example: '+22222000000' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ example: 'Mohamed Ould Ahmed' })
  @IsOptional()
  @IsString()
  ownerName?: string;

  @ApiPropertyOptional({
    enum: ContactType,
    default: ContactType.PRIMARY,
    example: ContactType.PRIMARY,
  })
  @IsOptional()
  @IsEnum(ContactType)
  type?: ContactType;
}
