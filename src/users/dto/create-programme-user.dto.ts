import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

// ADMIN_TAAZOUR-only. Creates a PROGRAMME web account with at least one
// programme scope — there is deliberately no self-registration path and no
// "default" scope: a PROGRAMME account with zero scopes would otherwise be
// locked out of all programme data by the existing row-level scoping.
export class CreateProgrammeUserDto {
  @ApiProperty({ example: 'programme.responsable@taazor.mr' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Responsable Programme Filet Social' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({
    description: 'Initial password. Never logged or returned by the API.',
    example: 'ChangeMe-Institutional-2026!',
  })
  @IsString()
  @MinLength(12)
  password: string;

  @ApiProperty({
    type: [String],
    description: 'Social programme ids this account is scoped to. At least one is required.',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  socialProgramIds: string[];
}
