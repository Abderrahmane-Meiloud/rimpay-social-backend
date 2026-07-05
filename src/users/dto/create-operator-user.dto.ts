import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, IsUUID, MinLength } from 'class-validator';

// ADMIN_TAAZOUR-only. Creates an OPERATOR web account linked to exactly one
// Operator, which must exist and be ACTIVE — an OPERATOR account without a
// valid operatorId is otherwise locked out of the system by design (see
// AuthService.isOperatorScopeValid).
export class CreateOperatorUserDto {
  @ApiProperty({ example: 'operateur.nord@taazor.mr' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Responsable Opérateur Nord' })
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
    description: 'Operator this account is linked to. Must exist and be ACTIVE.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  operatorId: string;
}
