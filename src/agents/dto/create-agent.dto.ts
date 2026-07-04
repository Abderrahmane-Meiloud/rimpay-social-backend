import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAgentDto {
  @ApiProperty({
    description:
      'User to link this agent profile to. One user cannot have more than one agent profile.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ example: '+22222000000' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ example: 'EMP-001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  employeeCode?: string;
}
