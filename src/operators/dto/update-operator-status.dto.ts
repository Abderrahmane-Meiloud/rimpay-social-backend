import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { OperatorStatus } from '../../../generated/prisma/client';

export class UpdateOperatorStatusDto {
  @ApiProperty({ enum: OperatorStatus, example: OperatorStatus.SUSPENDED })
  @IsEnum(OperatorStatus)
  status: OperatorStatus;
}
