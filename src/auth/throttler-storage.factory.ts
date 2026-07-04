import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { RedisThrottleClient } from './redis-throttle-client';

/**
 * Wraps an already-verified, Nest-managed `RedisThrottleClient` in the
 * Redis-backed throttler storage adapter. The client's connectivity
 * (connect()/ping()) is verified by `createVerifiedRedisThrottleClient`
 * before this is called; shutdown of the underlying ioredis client is
 * owned exclusively by `RedisThrottleClient.onModuleDestroy` (see
 * redis-throttle-client.ts), not by this adapter.
 */
export function buildRedisThrottlerStorage(
  redisClient: RedisThrottleClient,
): ThrottlerStorage {
  try {
    return new ThrottlerStorageRedisService(redisClient.getClient());
  } catch {
    // Never surface the raw adapter error: it could echo constructor
    // arguments (e.g. connection options) that embed credentials.
    throw new Error('Redis throttle storage initialization failed.');
  }
}
