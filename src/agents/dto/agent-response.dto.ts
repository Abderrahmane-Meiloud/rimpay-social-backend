import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AgentStatus,
  GeoAssignmentStatus,
  UserStatus,
} from '../../../generated/prisma/client';

export class GeoSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() code: string;
}

export class UserSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() fullName: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: UserStatus }) status: UserStatus;
}

export class AgentListItemDto {
  @ApiProperty() id: string;

  @ApiPropertyOptional({ nullable: true }) employeeCode: string | null;
  @ApiPropertyOptional({ nullable: true }) phone: string | null;

  @ApiProperty({ enum: AgentStatus }) status: AgentStatus;

  @ApiPropertyOptional({ type: UserSummaryDto, nullable: true })
  user: UserSummaryDto | null;

  @ApiProperty({ example: 0 }) devicesCount: number;

  @ApiProperty() createdAt: Date;
}

export class PaginatedAgentsDto {
  @ApiProperty({ type: [AgentListItemDto] }) data: AgentListItemDto[];
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 20 }) limit: number;
  @ApiProperty({ example: 50 }) total: number;
  @ApiProperty({ example: 3 }) totalPages: number;
}

export type GeoLevel = 'REGION' | 'MOUGHATAA' | 'COMMUNE' | 'LOCALITY';

export class GeographicAssignmentDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: GeoAssignmentStatus }) status: GeoAssignmentStatus;
  @ApiProperty({ enum: ['REGION', 'MOUGHATAA', 'COMMUNE', 'LOCALITY'] })
  level: GeoLevel;
  @ApiPropertyOptional({ type: GeoSummaryDto, nullable: true }) region: GeoSummaryDto | null;
  @ApiPropertyOptional({ type: GeoSummaryDto, nullable: true }) moughataa: GeoSummaryDto | null;
  @ApiPropertyOptional({ type: GeoSummaryDto, nullable: true }) commune: GeoSummaryDto | null;
  @ApiPropertyOptional({ type: GeoSummaryDto, nullable: true }) locality: GeoSummaryDto | null;
  @ApiPropertyOptional({ nullable: true }) startsAt: Date | null;
  @ApiPropertyOptional({ nullable: true }) endsAt: Date | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class DeviceSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() deviceUid: string;
  @ApiPropertyOptional({ nullable: true }) platform: string | null;
  @ApiPropertyOptional({ nullable: true }) model: string | null;
  @ApiProperty() status: string;
  @ApiPropertyOptional({ nullable: true }) lastSeenAt: Date | null;
}

export class OperationAssignmentSummaryDto {
  @ApiProperty({ example: 0 }) total: number;
  @ApiProperty({ example: 0 }) active: number;
  @ApiProperty({
    example: { ACTIVE: 1, COMPLETED: 2 },
    description: 'Assignment counts keyed by OperationAgentStatus.',
  })
  byStatus: Record<string, number>;
}

export class AgentDetailDto extends AgentListItemDto {
  @ApiProperty() updatedAt: Date;
  @ApiProperty({ type: [DeviceSummaryDto] }) devices: DeviceSummaryDto[];
  @ApiProperty({ type: [GeographicAssignmentDto] })
  geographicAssignments: GeographicAssignmentDto[];
  @ApiProperty({ type: OperationAssignmentSummaryDto })
  operationAssignmentSummary: OperationAssignmentSummaryDto;
}
