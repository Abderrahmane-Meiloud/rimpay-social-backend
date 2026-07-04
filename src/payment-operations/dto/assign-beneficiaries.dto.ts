import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumberString,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class AssignBeneficiaryItemDto {
  @ApiProperty()
  @IsUUID()
  beneficiaryId: string;

  @ApiPropertyOptional({
    description: 'Planned amount for this beneficiary in this operation.',
    example: '25000.00',
  })
  @IsOptional()
  @IsNumberString()
  plannedAmount?: string;
}

export class AssignBeneficiariesDto {
  @ApiProperty({ type: [AssignBeneficiaryItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => AssignBeneficiaryItemDto)
  beneficiaries: AssignBeneficiaryItemDto[];
}
