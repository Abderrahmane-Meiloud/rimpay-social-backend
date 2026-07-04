import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AnomalySeverity,
  AnomalyStatus,
  AnomalyType,
} from '../../../generated/prisma/client';

export class AnomalyRelatedBeneficiaryDto {
  @ApiProperty() id: string;
  @ApiProperty() fullName: string;
  @ApiProperty() registryCode: string;
}

export class AnomalyRelatedPaymentDto {
  @ApiProperty() id: string;
  @ApiProperty() status: string;
  @ApiPropertyOptional({ nullable: true, type: Number }) amount: number | null;
}

export class AnomalyRelatedOperationDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() status: string;
}

export class AnomalyRelatedAgentDto {
  @ApiProperty() id: string;
  @ApiProperty() fullName: string;
  @ApiProperty() status: string;
}

export class AnomalyRelatedDeviceDto {
  @ApiProperty() id: string;
  @ApiProperty() deviceUid: string;
  @ApiProperty() status: string;
}

export class AnomalyRelatedSyncBatchDto {
  @ApiProperty() id: string;
  @ApiProperty() batchUid: string;
  @ApiProperty() status: string;
}

export class AnomalySummaryDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: AnomalyType }) type: AnomalyType;
  @ApiProperty({ enum: AnomalySeverity }) severity: AnomalySeverity;
  @ApiProperty({ enum: AnomalyStatus }) status: AnomalyStatus;
  @ApiProperty() entityType: string;
  @ApiPropertyOptional({ nullable: true, type: String }) entityId: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) beneficiaryId: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) paymentId: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) paymentOperationId: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) agentId: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) deviceId: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) syncBatchId: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) description: string | null;
  @ApiProperty() detectedAt: Date;
  @ApiPropertyOptional({ nullable: true }) resolvedAt: Date | null;
  @ApiProperty() createdAt: Date;
}

export class AnomalyDetailDto extends AnomalySummaryDto {
  @ApiPropertyOptional({ nullable: true, type: String }) syncItemId: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) resolutionNotes: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) resolvedBy: string | null;
  @ApiPropertyOptional({ nullable: true }) beneficiary: AnomalyRelatedBeneficiaryDto | null;
  @ApiPropertyOptional({ nullable: true }) payment: AnomalyRelatedPaymentDto | null;
  @ApiPropertyOptional({ nullable: true }) paymentOperation: AnomalyRelatedOperationDto | null;
  @ApiPropertyOptional({ nullable: true }) agent: AnomalyRelatedAgentDto | null;
  @ApiPropertyOptional({ nullable: true }) device: AnomalyRelatedDeviceDto | null;
  @ApiPropertyOptional({ nullable: true }) syncBatch: AnomalyRelatedSyncBatchDto | null;
  @ApiProperty() updatedAt: Date;
}
