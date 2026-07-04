import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelPaymentDto {
  @ApiPropertyOptional({
    description: 'Optional reason recorded in payment status history and audit.',
    example: 'Beneficiary deceased before disbursement',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
