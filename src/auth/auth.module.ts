import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import type { SignOptions } from 'jsonwebtoken';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { AuthThrottleGuard } from './guards/auth-throttle.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { buildRedisThrottlerStorage } from './throttler-storage.factory';
import { RedisThrottleClient } from './redis-throttle-client';
import { RedisThrottleModule } from './redis-throttle.module';

const PLACEHOLDER_JWT_SECRETS = new Set([
  'change_this_secret_later',
  'replace_with_a_strong_secret',
]);

@Module({
  imports: [
    forwardRef(() => UsersModule),
    PassportModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, RedisThrottleModule],
      inject: [ConfigService, RedisThrottleClient],
      useFactory: (config: ConfigService, redisClient: RedisThrottleClient) => {
        const nodeEnv = config.get<string>('NODE_ENV');

        if (nodeEnv === 'production') {
          return { throttlers: [], storage: buildRedisThrottlerStorage(redisClient) };
        }

        return { throttlers: [] };
      },
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');

        if (!secret) {
          throw new Error(
            'JWT_SECRET is not set. Please configure it in your .env file.',
          );
        }

        if (PLACEHOLDER_JWT_SECRETS.has(secret)) {
          throw new Error(
            'JWT_SECRET is set to a placeholder value. Please update it in ' +
              'your .env file before starting the application.',
          );
        }

        return {
          secret,
          signOptions: {
            expiresIn: (configService.get<string>('JWT_EXPIRES_IN') ??
              '15m') as SignOptions['expiresIn'],
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionService, AuthThrottleGuard, JwtStrategy],
  exports: [AuthService, SessionService],
})
export class AuthModule {}
