import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { OperationAgentStatus } from '../../../generated/prisma/client';

export class AssignOperationAgentItemDto {
  @ApiProperty()
  @IsUUID()
  agentId: string;

  @ApiPropertyOptional({
    description: "Freeform text describing the agent's assigned area within the operation.",
    example: 'Dar Naim North sector',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  assignedArea?: string;
}

export class AssignOperationAgentsDto {
  @ApiProperty({ type: [AssignOperationAgentItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AssignOperationAgentItemDto)
  agents: AssignOperationAgentItemDto[];
}

export class OperationAgentResultItemDto {
  @ApiProperty() agentId: string;
  @ApiProperty({ enum: OperationAgentStatus }) status: OperationAgentStatus;
  @ApiPropertyOptional({ nullable: true }) assignedArea: string | null;
  @ApiProperty({ example: false }) alreadyAssigned: boolean;
}

export class OperationAgentAssignmentResponseDto {
  @ApiProperty({ example: 2 }) assigned: number;
  @ApiProperty({ example: 1 }) skippedDuplicates: number;
  @ApiProperty({ type: [OperationAgentResultItemDto] })
  items: OperationAgentResultItemDto[];
}
