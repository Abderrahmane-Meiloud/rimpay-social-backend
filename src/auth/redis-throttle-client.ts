import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Owns the single ioredis client used for production throttle storage.
 * `ThrottlerStorageRedisService` only sets `disconnectRequired` (and thus
 * only closes the client in its own onModuleDestroy) when it constructs
 * the client itself from a string/options. When handed an already-built
 * Redis instance (our case, so connectivity can be verified before the
 * storage is created), the adapter never closes it. This class is
 * registered as a Nest provider and is the single owner responsible for
 * closing that externally-created client exactly once during shutdown.
 *
 * In non-production environments this provider is registered with a
 * `null` client: `onModuleDestroy` is then a no-op and no Redis
 * connection is ever created.
 */
@Injectable()
export class RedisThrottleClient implements OnModuleDestroy {
  private readonly logger = new Logger(RedisThrottleClient.name);
  private shutDown = false;

  constructor(private readonly client: Redis | null) {}

  getClient(): Redis {
    if (!this.client) {
      throw new Error('RedisThrottleClient has no client in this environment.');
    }
    return this.client;
  }

  onModuleDestroy(): void {
    if (this.shutDown || !this.client) {
      return;
    }
    this.shutDown = true;
    this.client.disconnect();
    this.logger.log('Production throttle Redis client disconnected.');
  }
}

/**
 * Stable, safe error message for any Redis throttle connection failure.
 * Never includes the raw upstream ioredis error message, the
 * THROTTLE_REDIS_URL, or any credential: the upstream message may embed
 * the connection string (ioredis includes it in some error variants),
 * so it must never be concatenated into an externally surfaced error or
 * log line.
 */
const REDIS_CONNECTION_FAILED_MESSAGE = 'Redis throttle connection failed.';

/**
 * Builds and verifies the ioredis client for THROTTLE_REDIS_URL. Verifies
 * connect() and ping() before returning, so a broken Redis configuration
 * fails module compilation (and thus app startup) before the HTTP server
 * begins serving requests. Never logs or throws the raw URL or the raw
 * upstream error message (either may embed credentials).
 */
export async function createVerifiedRedisThrottleClient(
  redisUrl: string,
): Promise<RedisThrottleClient> {
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    retryStrategy: () => null,
    maxRetriesPerRequest: 1,
  });

  try {
    await client.connect();
    const pong = await client.ping();
    if (pong !== 'PONG') {
      throw new Error('Unexpected Redis PING response.');
    }
  } catch {
    client.disconnect();
    throw new Error(REDIS_CONNECTION_FAILED_MESSAGE);
  }

  return new RedisThrottleClient(client);
}
