import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SyncBatchStatus, SyncItemStatus } from '../../../generated/prisma/client';

export class SyncItemResultDto {
  @ApiProperty() localId: string;
  @ApiProperty() itemType: string;
  @ApiProperty() idempotencyKey: string;
  @ApiProperty({ enum: SyncItemStatus }) status: SyncItemStatus;
  @ApiPropertyOptional({ nullable: true, type: String }) errorMessage: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) linkedPaymentId: string | null;
  @ApiPropertyOptional({ nullable: true }) processedAt: Date | null;
}

export class SyncBatchResponseDto {
  @ApiProperty() batchId: string;
  @ApiProperty() batchUid: string;
  @ApiProperty({ enum: SyncBatchStatus }) status: SyncBatchStatus;
  @ApiProperty() alreadyProcessed: boolean;
  @ApiProperty() totalItems: number;
  @ApiProperty() acceptedItems: number;
  @ApiProperty() rejectedItems: number;
  @ApiProperty() conflictItems: number;
  @ApiPropertyOptional({ nullable: true }) startedAt: Date | null;
  @ApiPropertyOptional({ nullable: true }) completedAt: Date | null;
  @ApiProperty({ type: [SyncItemResultDto] }) items: SyncItemResultDto[];
}

export class SyncBatchSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() batchUid: string;
  @ApiProperty({ enum: SyncBatchStatus }) status: SyncBatchStatus;
  @ApiProperty() totalItems: number;
  @ApiProperty() acceptedItems: number;
  @ApiProperty() rejectedItems: number;
  @ApiProperty() conflictItems: number;
  @ApiPropertyOptional({ nullable: true }) startedAt: Date | null;
  @ApiPropertyOptional({ nullable: true }) completedAt: Date | null;
  @ApiProperty() agentId: string;
  @ApiProperty() deviceId: string;
  @ApiProperty() createdAt: Date;
}

export class PaginatedSyncBatchesDto {
  @ApiProperty({ type: [SyncBatchSummaryDto] }) data: SyncBatchSummaryDto[];
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
  @ApiProperty() totalPages: number;
}

export class SyncBatchDetailDto extends SyncBatchSummaryDto {
  @ApiProperty({ type: [SyncItemResultDto] }) items: SyncItemResultDto[];
}
