import { Prisma } from '../../generated/prisma/client';
import { UserDetailDto, UserListItemDto } from './dto/user-response.dto';

// Web users only (userRoles.some(role.isWebRole=true)) — AGENT accounts are
// filtered out at the query level (see UsersService.buildWebUserWhere), so
// this select/mapper never needs to special-case AGENT. Deliberately never
// selects passwordHash or any session/token field.
export const userListSelect = {
  id: true,
  email: true,
  fullName: true,
  status: true,
  operatorId: true,
  createdAt: true,
  updatedAt: true,
  userRoles: { select: { role: { select: { name: true } } } },
  programmeScopes: { select: { socialProgramId: true } },
} satisfies Prisma.UserSelect;

export type UserListRow = Prisma.UserGetPayload<{ select: typeof userListSelect }>;

export function toUserListItem(row: UserListRow): UserListItemDto {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    status: row.status,
    roles: row.userRoles.map((ur) => ur.role.name),
    operatorId: row.operatorId,
    programmeIds: row.programmeScopes.map((s) => s.socialProgramId),
    createdAt: row.createdAt,
  };
}

export function toUserDetail(row: UserListRow): UserDetailDto {
  return {
    ...toUserListItem(row),
    updatedAt: row.updatedAt,
  };
}
