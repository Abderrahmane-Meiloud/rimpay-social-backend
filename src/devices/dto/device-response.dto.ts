import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceStatus } from '../../../generated/prisma/client';

export class AgentMinimalSummaryDto {
  @ApiProperty() id: string;
  @ApiPropertyOptional({ nullable: true }) employeeCode: string | null;
  @ApiPropertyOptional({ nullable: true })
  user: { id: string; fullName: string } | null;
}

export class DeviceListItemDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'DEV-ABC123' }) deviceUid: string;
  @ApiPropertyOptional({ nullable: true }) platform: string | null;
  @ApiPropertyOptional({ nullable: true }) model: string | null;
  @ApiPropertyOptional({ nullable: true }) appVersion: string | null;
  @ApiProperty({ enum: DeviceStatus }) status: DeviceStatus;
  @ApiPropertyOptional({ nullable: true }) lastSeenAt: Date | null;
  @ApiProperty({ type: AgentMinimalSummaryDto }) agent: AgentMinimalSummaryDto;
  @ApiProperty() createdAt: Date;
}

export class DeviceDetailDto extends DeviceListItemDto {
  @ApiProperty() updatedAt: Date;
}

export class PaginatedDevicesDto {
  @ApiProperty({ type: [DeviceListItemDto] }) data: DeviceListItemDto[];
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 20 }) limit: number;
  @ApiProperty({ example: 30 }) total: number;
  @ApiProperty({ example: 2 }) totalPages: number;
}
