import { ApiProperty } from '@nestjs/swagger';
import { SafeUserDto } from './auth-response.dto';

export class MeResponseDto {
  @ApiProperty({ type: SafeUserDto })
  user: SafeUserDto;

  @ApiProperty({ type: [String], example: ['ADMIN'] })
  roles: string[];

  @ApiProperty({
    type: [String],
    example: ['beneficiaries.read', 'beneficiaries.create'],
  })
  permissions: string[];
}
