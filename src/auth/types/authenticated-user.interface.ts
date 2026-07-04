import { UserStatus } from '../../../generated/prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  roles: string[];
  permissions: string[];
  sessionId: string;
}
