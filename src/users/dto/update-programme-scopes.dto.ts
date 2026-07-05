import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

// Replaces (not merges) the full set of programme scopes for a PROGRAMME
// user. At least one scope is required — see CreateProgrammeUserDto for why.
export class UpdateProgrammeScopesDto {
  @ApiProperty({ type: [String], example: ['550e8400-e29b-41d4-a716-446655440000'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  socialProgramIds: string[];
}
