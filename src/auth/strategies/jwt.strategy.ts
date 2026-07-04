import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserStatus } from '../../../generated/prisma/client';
import { UsersService } from '../../users/users.service';
import { AuthService } from '../auth.service';
import { SessionService } from '../session.service';
import { JwtPayload } from '../types/jwt-payload.interface';
import { AuthenticatedUser } from '../types/authenticated-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload.sid || typeof payload.av !== 'number') {
      throw new UnauthorizedException('Unauthorized');
    }

    const user = await this.usersService.findByIdWithRoles(payload.sub);

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (payload.av !== user.authVersion) {
      throw new UnauthorizedException('Unauthorized');
    }

    const active = await this.sessionService.isSessionActive(
      payload.sid,
      user.id,
    );
    if (!active) {
      throw new UnauthorizedException('Unauthorized');
    }

    return this.authService.toAuthenticatedUser(user, payload.sid);
  }
}
