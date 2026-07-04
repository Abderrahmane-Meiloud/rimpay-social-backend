import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// payload is intentionally typed as `object` here and validated per-item in the
// service based on itemType. Strong typing at this layer would cause the whole
// HTTP request to return 400 on any malformed item, preventing per-item
// REJECTED recording.
export class SyncItemDto {
  @ApiProperty({ maxLength: 100, description: 'Device-local unique identifier for this item.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  localId: string;

  @ApiProperty({ description: 'Item type. Currently: "payment.validation".' })
  @IsString()
  @IsNotEmpty()
  itemType: string;

  @ApiProperty({ maxLength: 100, description: 'Idempotency key for this item.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  idempotencyKey: string;

  @ApiProperty({ description: 'Item payload. Structure depends on itemType.' })
  @IsObject()
  payload: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Client-side timestamp when the event occurred (audit only; server time used for paidAt/validatedAt).',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
