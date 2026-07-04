import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { DeviceStatus } from '../../../generated/prisma/client';

export class UpdateDeviceDto {
  @ApiPropertyOptional({ description: 'Reassign device to another ACTIVE agent.' })
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @ApiPropertyOptional({ enum: DeviceStatus })
  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus;

  @ApiPropertyOptional({ example: 'android' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  platform?: string;

  @ApiPropertyOptional({ example: 'Samsung Galaxy A52' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @ApiPropertyOptional({ example: '1.3.0' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  lastSeenAt?: string;
}
