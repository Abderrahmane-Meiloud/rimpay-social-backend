import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { AuthMethod, RecipientType } from '../../../generated/prisma/client';

export class ValidatePaymentDto {
  @ApiProperty({
    description: 'Agent performing the field validation.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  agentId: string;

  @ApiProperty({
    description: 'Device used for the field validation.',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  deviceId: string;

  @ApiProperty({ enum: AuthMethod, description: 'Method used to authenticate the recipient.' })
  @IsEnum(AuthMethod)
  authMethod: AuthMethod;

  @ApiProperty({ enum: RecipientType, description: 'Type of person who received the payment.' })
  @IsEnum(RecipientType)
  recipientType: RecipientType;

  @ApiPropertyOptional({ example: 'Aminata Diallo', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipientName?: string;

  @ApiPropertyOptional({
    description: 'GPS latitude. If provided, longitude must also be provided.',
    example: 18.0858,
    type: Number,
  })
  @IsOptional()
  @IsNumber()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({
    description: 'GPS longitude. Required when latitude is provided.',
    example: -15.9785,
    type: Number,
  })
  // Required when latitude is present; optional otherwise.
  @ValidateIf((o: ValidatePaymentDto) => o.latitude !== undefined && o.latitude !== null)
  @IsNumber()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({
    description:
      'Idempotency key — required. Prevents duplicate validations on network retries. ' +
      'Suggested format: <deviceUid>:<paymentId>:<timestamp>.',
    maxLength: 100,
    example: 'UID-P12-001:3f2a…:20260616T120000Z',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  idempotencyKey: string;
}
