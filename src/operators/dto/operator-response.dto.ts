import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OperatorStatus } from '../../../generated/prisma/client';

export class OperatorListItemDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'OP-NORD-01' }) code: string;
  @ApiProperty({ example: 'Opérateur Démonstration Nord' }) name: string;
  @ApiPropertyOptional({ nullable: true }) type: string | null;
  @ApiProperty({ enum: OperatorStatus }) status: OperatorStatus;
  @ApiProperty({ example: 0 }) agentsCount: number;
  @ApiProperty({ example: 0 }) paymentOperationsCount: number;
  @ApiProperty() createdAt: Date;
}

export class PaginatedOperatorsDto {
  @ApiProperty({ type: [OperatorListItemDto] }) data: OperatorListItemDto[];
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 20 }) limit: number;
  @ApiProperty({ example: 42 }) total: number;
  @ApiProperty({ example: 3 }) totalPages: number;
}

export class OperatorDetailDto extends OperatorListItemDto {
  @ApiPropertyOptional({ nullable: true }) legalName: string | null;
  @ApiPropertyOptional({ nullable: true }) contactName: string | null;
  @ApiPropertyOptional({ nullable: true }) contactPhone: string | null;
  @ApiPropertyOptional({ nullable: true }) contactEmail: string | null;
  @ApiProperty() updatedAt: Date;
}

// Minimal shape embedded in Agent/PaymentOperation responses.
export class OperatorSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() code: string;
  @ApiProperty({ enum: OperatorStatus }) status: OperatorStatus;
}
