import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SyncItemDto } from './sync-item.dto';

export class CreateSyncBatchDto {
  @ApiProperty({ maxLength: 100, description: 'Device-generated unique batch identifier.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  batchUid: string;

  @ApiProperty({ description: 'Agent performing the sync.' })
  @IsUUID()
  agentId: string;

  @ApiProperty({ description: 'Device submitting the sync batch.' })
  @IsUUID()
  deviceId: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'When the device started collecting this batch (audit only).' })
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'When the device completed collecting this batch (audit only).' })
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @ApiProperty({ type: [SyncItemDto], minItems: 1, maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SyncItemDto)
  items: SyncItemDto[];
}
