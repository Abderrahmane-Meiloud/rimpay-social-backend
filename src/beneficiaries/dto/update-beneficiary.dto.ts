import { ApiPropertyOptional } from '@nestjs/swagger';
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

// registryCode is intentionally NOT updatable: it is the immutable registry
// identity of the beneficiary. createdAt/id/deletedAt are never accepted from
// the client (forbidNonWhitelisted rejects them).
export class UpdateBeneficiaryDto {
  @ApiPropertyOptional({ example: 'Fatimetou Mint Sidi' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fullName?: string;

  @ApiPropertyOptional({
    description: 'New locality (beneficiary relocation). Must exist.',
    example: '00000000-0000-0000-0000-000000000000',
  })
  @IsOptional()
  @IsUUID()
  localityId?: string;

  @ApiPropertyOptional({ example: '1234567890' })
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

  @ApiPropertyOptional({ example: 'manual-correction' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ example: 'Corrected birth date after document review.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    enum: BeneficiaryStatus,
    example: BeneficiaryStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(BeneficiaryStatus)
  status?: BeneficiaryStatus;

  @ApiPropertyOptional({
    type: CreateBeneficiaryContactDto,
    description:
      'If provided, upserts the primary contact (creates one if none exists, ' +
      'otherwise updates the existing primary contact).',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateBeneficiaryContactDto)
  primaryContact?: CreateBeneficiaryContactDto;

  @ApiPropertyOptional({
    description: 'Optional justification recorded in the change history.',
    example: 'Beneficiary relocated to a new commune.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
