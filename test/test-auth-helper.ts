import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SessionService } from '../src/auth/session.service';
import { UsersService } from '../src/users/users.service';
import { AuthService } from '../src/auth/auth.service';

export interface TokenSet {
  admin: string;
  programme: string;
  operator: string;
  agent: string;
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
    programme: { id: string; email: string; password: string };
    operator: { id: string; email: string; password: string };
    agent: { id: string; email: string; password: string };
  },
): Promise<TokenSet> {
  const [admin, programme, operator, agent] = await Promise.all([
    createTokenFor(app, users.admin.id),
    createTokenFor(app, users.programme.id),
    createTokenFor(app, users.operator.id),
    createTokenFor(app, users.agent.id),
  ]);

  return { admin, programme, operator, agent };
}
