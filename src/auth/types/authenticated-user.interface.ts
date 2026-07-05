import { UserStatus } from '../../../generated/prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  roles: string[];
  permissions: string[];
  sessionId: string;
  // Institutional scoping (INSTITUTIONAL-RBAC-2). Populated fresh on every
  // request from the current database state — never trust stale JWT claims
  // for scope, since a user's programme/operator assignment can change
  // mid-session.
  operatorId: string | null;
  programmeIds: string[];
}
