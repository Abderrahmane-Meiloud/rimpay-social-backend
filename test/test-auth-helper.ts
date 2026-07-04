import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SessionService } from '../src/auth/session.service';
import { UsersService } from '../src/users/users.service';
import { AuthService } from '../src/auth/auth.service';

export interface TokenSet {
  admin: string;
  programManager: string;
  supervisor: string;
  agent: string;
  auditor: string;
}

async function createTokenFor(
  app: INestApplication,
  userId: string,
): Promise<string> {
  const sessionService = app.get(SessionService);
  const usersService = app.get(UsersService);
  const authService = app.get(AuthService);
  const jwtService = app.get(JwtService);

  const { sessionId } = await sessionService.createSessionWithAudit(userId, {});
  const user = await usersService.findByIdWithRoles(userId);
  if (!user) throw new Error(`User ${userId} not found`);

  const { roles } = authService.extractRolesAndPermissions(user);

  return jwtService.signAsync({
    sub: user.id,
    email: user.email,
    roles,
    sid: sessionId,
    av: user.authVersion,
  });
}

export async function getTokens(
  app: INestApplication,
  users: {
    admin: { id: string; email: string; password: string };
    programManager: { id: string; email: string; password: string };
    supervisor: { id: string; email: string; password: string };
    agent: { id: string; email: string; password: string };
    auditor: { id: string; email: string; password: string };
  },
): Promise<TokenSet> {
  const [admin, programManager, supervisor, agent, auditor] = await Promise.all([
    createTokenFor(app, users.admin.id),
    createTokenFor(app, users.programManager.id),
    createTokenFor(app, users.supervisor.id),
    createTokenFor(app, users.agent.id),
    createTokenFor(app, users.auditor.id),
  ]);

  return { admin, programManager, supervisor, agent, auditor };
}
