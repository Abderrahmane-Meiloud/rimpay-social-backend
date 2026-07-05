import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UpdateOperatorScopeDto {
  @ApiProperty({
    description: 'New operator to link this account to. Must exist and be ACTIVE.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  operatorId: string;
}
