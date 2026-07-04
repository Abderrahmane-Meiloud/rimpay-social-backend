import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { OperationStatus } from '../../../generated/prisma/client';

export class TransitionStatusDto {
  @ApiProperty({
    enum: OperationStatus,
    description: 'Target status for the operation lifecycle transition',
    example: OperationStatus.VALIDATED,
  })
  @IsEnum(OperationStatus)
  targetStatus: OperationStatus;
}
