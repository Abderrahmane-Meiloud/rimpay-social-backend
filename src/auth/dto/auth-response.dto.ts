import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '../../../generated/prisma/client';

export class SafeUserDto {
  @ApiProperty({ example: 'b3f1c1f0-1234-4abc-9def-1234567890ab' })
  id: string;

  @ApiProperty({ example: 'admin@rimpay.local' })
  email: string;

  @ApiProperty({ example: 'System Administrator' })
  fullName: string;

  @ApiProperty({ enum: UserStatus, example: UserStatus.ACTIVE })
  status: UserStatus;
}

export class AuthResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({ type: SafeUserDto })
  user: SafeUserDto;

  @ApiProperty({ type: [String], example: ['ADMIN_TAAZOUR'] })
  roles: string[];

  @ApiProperty({
    type: [String],
    example: ['beneficiaries.read', 'beneficiaries.create'],
  })
  permissions: string[];
}
