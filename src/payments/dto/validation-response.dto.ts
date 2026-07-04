import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AuthMethod,
  PaymentStatus,
  RecipientType,
  ValidationOutcome,
} from '../../../generated/prisma/client';

export class ValidationResponseDto {
  @ApiProperty() validationId: string;
  @ApiProperty() paymentId: string;

  @ApiProperty({ enum: ValidationOutcome }) outcome: ValidationOutcome;
  @ApiProperty({ enum: PaymentStatus }) paymentStatus: PaymentStatus;

  @ApiPropertyOptional({ nullable: true, type: String }) paidAt: Date | null;
  @ApiProperty() validatedAt: Date;

  @ApiProperty() agentId: string;
  @ApiProperty() deviceId: string;
  @ApiProperty({ enum: AuthMethod }) authMethod: AuthMethod;
  @ApiPropertyOptional({ enum: RecipientType, nullable: true }) recipientType: RecipientType | null;
  @ApiPropertyOptional({ nullable: true, type: String }) recipientName: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Decimal string or null' })
  latitude: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Decimal string or null' })
  longitude: string | null;

  @ApiPropertyOptional({ nullable: true, type: String }) notes: string | null;
  @ApiProperty() idempotencyKey: string;
}
