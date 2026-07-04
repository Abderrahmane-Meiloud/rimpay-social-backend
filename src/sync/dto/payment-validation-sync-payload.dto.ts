import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { AuthMethod, RecipientType } from '../../../generated/prisma/client';

export class PaymentValidationSyncPayloadDto {
  @IsUUID()
  paymentId: string;

  @IsEnum(AuthMethod)
  authMethod: AuthMethod;

  @IsEnum(RecipientType)
  recipientType: RecipientType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipientName?: string;

  @IsOptional()
  @IsNumber()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
