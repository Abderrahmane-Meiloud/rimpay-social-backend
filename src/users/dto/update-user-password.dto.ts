import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdateUserPasswordDto {
  @ApiProperty({
    description: 'New password. Never logged or returned by the API.',
    example: 'New-Institutional-Password-2026!',
  })
  @IsString()
  @MinLength(12)
  password: string;
}
