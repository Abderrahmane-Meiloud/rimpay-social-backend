import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '../../../generated/prisma/client';

// Never includes passwordHash, refresh/session token hashes, or any other
// credential material — only safe, displayable account fields.
export class UserListItemDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'programme@taazor.mr' }) email: string;
  @ApiProperty({ example: 'Responsable Programme' }) fullName: string;
  @ApiProperty({ enum: UserStatus }) status: UserStatus;
  @ApiProperty({
    type: [String],
    description: 'Web roles only (ADMIN_TAAZOUR, PROGRAMME, OPERATOR) — AGENT is never returned here.',
    example: ['PROGRAMME'],
  })
  roles: string[];
  @ApiPropertyOptional({ nullable: true }) operatorId: string | null;
  @ApiProperty({ type: [String] }) programmeIds: string[];
  @ApiProperty() createdAt: Date;
}

export class PaginatedUsersDto {
  @ApiProperty({ type: [UserListItemDto] }) data: UserListItemDto[];
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 20 }) limit: number;
  @ApiProperty({ example: 3 }) total: number;
  @ApiProperty({ example: 1 }) totalPages: number;
}

export class UserDetailDto extends UserListItemDto {
  @ApiProperty() updatedAt: Date;
}
