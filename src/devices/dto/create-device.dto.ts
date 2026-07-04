import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateDeviceDto {
  @ApiProperty({ description: 'The agent this device belongs to.' })
  @IsUUID()
  agentId: string;

  @ApiProperty({ example: 'DEV-ABC123', description: 'Unique hardware/app identifier.' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  deviceUid: string;

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

  @ApiPropertyOptional({ example: '1.2.0' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string;
}
