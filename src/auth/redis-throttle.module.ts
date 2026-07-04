import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createVerifiedRedisThrottleClient,
  RedisThrottleClient,
} from './redis-throttle-client';

/**
 * Dedicated `@Global()` module for `RedisThrottleClient`, imported once
 * from `ThrottlerModule.forRootAsync`'s own `imports` in AuthModule (that
 * dynamic module's factory needs `RedisThrottleClient` in its own import
 * scope to resolve it via `inject`). `@Global()` additionally makes the
 * provider visible application-wide without a second import elsewhere.
 */
@Global()
@Module({
  providers: [
    {
      provide: RedisThrottleClient,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const nodeEnv = config.get<string>('NODE_ENV');

        if (nodeEnv !== 'production') {
          return new RedisThrottleClient(null);
        }

        const redisUrl = config.get<string>('THROTTLE_REDIS_URL');
        if (!redisUrl) {
          // Safe to name the required variable: this is a configuration
          // key, never a secret value.
          throw new Error(
            'Redis throttle configuration is invalid: THROTTLE_REDIS_URL ' +
              'is required in production. Multi-instance deployments must ' +
              'use Redis-backed ThrottlerStorage. Set THROTTLE_REDIS_URL ' +
              'or use a non-production NODE_ENV.',
          );
        }

        return createVerifiedRedisThrottleClient(redisUrl);
      },
    },
  ],
  exports: [RedisThrottleClient],
})
export class RedisThrottleModule {}
