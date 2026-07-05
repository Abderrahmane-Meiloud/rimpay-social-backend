import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@taazor.mr' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'your-password' })
  @IsString()
  @MinLength(1)
  password: string;
}
