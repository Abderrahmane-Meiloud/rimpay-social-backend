import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ThrottlerStorageService } from '@nestjs/throttler/dist/throttler.service';
import { AppModule } from '../src/app.module';
import {
  RedisThrottleClient,
  createVerifiedRedisThrottleClient,
} from '../src/auth/redis-throttle-client';

/**
 * Verifies production throttle storage wiring and Redis client lifecycle
 * ownership without requiring a real Redis server: the ioredis client is
 * mocked so real connect()/ping()/disconnect() control flow is exercised
 * against a fake transport.
 *
 * `AppModule` reads NODE_ENV / THROTTLE_REDIS_URL at compile time (via
 * ConfigService), not at module-load time, so process.env can be
 * toggled per-test without re-importing modules (which would create
 * duplicate NestJS framework singletons like Reflector).
 */

type MockRedisInstance = {
  connect: jest.Mock;
  ping: jest.Mock;
  disconnect: jest.Mock;
};

const mockRedisInstances: MockRedisInstance[] = [];
let nextConnectImpl: (() => Promise<void>) | null = null;
let nextPingResult: string | null = null;

jest.mock('ioredis', () => {
  class MockCluster {}
  const MockRedis = jest.fn().mockImplementation(() => {
    const connectImpl = nextConnectImpl;
    const pingResult = nextPingResult ?? 'PONG';
    nextConnectImpl = null;
    nextPingResult = null;
    const instance: MockRedisInstance = {
      connect: connectImpl
        ? jest.fn().mockImplementation(connectImpl)
        : jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue(pingResult),
      disconnect: jest.fn(),
    };
    // `ThrottlerStorageRedisService`'s constructor does `instanceof Redis`
    // / `instanceof Cluster` checks on whatever it's handed. A mock
    // factory that *returns* a plain object from `mockImplementation`
    // does NOT make that object `instanceof MockRedis` (returning
    // overrides the constructed `this`, discarding its prototype chain).
    // Without this fix, the adapter's `instanceof` check silently fails,
    // falls through to its "build a new client from options" branch, and
    // constructs a second, real `ioredis` client from what it treats as
    // connection options — exactly the double-client bug this test suite
    // exists to catch.
    Object.setPrototypeOf(instance, MockRedis.prototype);
    mockRedisInstances.push(instance);
    return instance;
  });
  return {
    __esModule: true,
    default: MockRedis,
    Cluster: MockCluster,
  };
});

async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
}

describe('RedisThrottleClient (unit)', () => {
  beforeEach(() => {
    mockRedisInstances.length = 0;
    nextConnectImpl = null;
    nextPingResult = null;
    jest.clearAllMocks();
  });

  it('throws a stable safe message when Redis connect() rejects and cleans up the client', async () => {
    nextConnectImpl = async () => {
      throw new Error('ECONNREFUSED');
    };

    await expect(
      createVerifiedRedisThrottleClient('redis://localhost:6379'),
    ).rejects.toThrow(/Redis throttle connection failed/);

    expect(mockRedisInstances[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('throws a stable safe message when Redis PING returns an unexpected response', async () => {
    nextPingResult = 'WRONG';

    await expect(
      createVerifiedRedisThrottleClient('redis://localhost:6379'),
    ).rejects.toThrow(/Redis throttle connection failed/);

    expect(mockRedisInstances[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('never leaks a hostile upstream error message containing Redis credentials', async () => {
    const hostileUrl = 'redis://:supersecretpassword@localhost:6379';
    nextConnectImpl = async () => {
      // Simulate an ioredis error whose own message embeds the
      // connection string, as some real ioredis error variants do.
      throw new Error(
        `connect ECONNREFUSED ${hostileUrl} (auth failed for ${hostileUrl})`,
      );
    };

    let caught: Error | null = null;
    try {
      await createVerifiedRedisThrottleClient(hostileUrl);
    } catch (err) {
      caught = err as Error;
    }

    expect(caught).not.toBeNull();
    expect(caught!.message).not.toContain('supersecretpassword');
    expect(caught!.message).not.toContain(hostileUrl);
    expect(caught!.message).toBe('Redis throttle connection failed.');
  });

  it('returns a verified client wrapper when connection succeeds', async () => {
    const redisClient = await createVerifiedRedisThrottleClient(
      'redis://localhost:6379',
    );

    expect(mockRedisInstances[0].connect).toHaveBeenCalledTimes(1);
    expect(mockRedisInstances[0].ping).toHaveBeenCalledTimes(1);
    expect(redisClient.getClient()).toBe(mockRedisInstances[0]);
  });

  it('closes the underlying client exactly once, even across repeated onModuleDestroy calls', async () => {
    const redisClient = await createVerifiedRedisThrottleClient(
      'redis://localhost:6379',
    );

    redisClient.onModuleDestroy();
    redisClient.onModuleDestroy();
    redisClient.onModuleDestroy();

    expect(mockRedisInstances[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('a null client (non-production) is a no-op on shutdown and creates no Redis instance', () => {
    const redisClient = new RedisThrottleClient(null);

    expect(() => redisClient.onModuleDestroy()).not.toThrow();
    expect(mockRedisInstances.length).toBe(0);
  });
});

describe('Production throttle storage — full app boot (P0)', () => {
  beforeEach(() => {
    mockRedisInstances.length = 0;
    nextConnectImpl = null;
    nextPingResult = null;
    jest.clearAllMocks();
  });

  it('test mode starts successfully with in-memory storage and creates no Redis client', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const storage = moduleRef.get<ThrottlerStorage>(ThrottlerStorage);
    expect(storage).toBeInstanceOf(ThrottlerStorageService);
    expect(mockRedisInstances.length).toBe(0);

    await moduleRef.close();

    // Shutdown of a test-mode module must not attempt Redis cleanup
    // (there was never a client to close).
    expect(mockRedisInstances.length).toBe(0);
  });

  it('repeated module close in test mode resolves without error', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await expect(moduleRef.close()).resolves.not.toThrow();
    await expect(moduleRef.close()).resolves.not.toThrow();
  });

  it('production with missing THROTTLE_REDIS_URL fails before serving requests', async () => {
    await withEnv(
      { NODE_ENV: 'production', THROTTLE_REDIS_URL: undefined },
      async () => {
        await expect(
          Test.createTestingModule({ imports: [AppModule] }).compile(),
        ).rejects.toThrow(/THROTTLE_REDIS_URL/);

        expect(mockRedisInstances.length).toBe(0);
      },
    );
  });

  it('successful production boot constructs exactly one Redis client, connects and pings it once, and closes it exactly once on module close', async () => {
    await withEnv(
      {
        NODE_ENV: 'production',
        THROTTLE_REDIS_URL: 'redis://localhost:6379',
      },
      async () => {
        const moduleRef = await Test.createTestingModule({
          imports: [AppModule],
        }).compile();

        expect(mockRedisInstances).toHaveLength(1);
        expect(mockRedisInstances[0].connect).toHaveBeenCalledTimes(1);
        expect(mockRedisInstances[0].ping).toHaveBeenCalledTimes(1);

        const storage = moduleRef.get<ThrottlerStorage>(ThrottlerStorage);
        expect(storage).toBeInstanceOf(ThrottlerStorageRedisService);
        expect(storage).not.toBeInstanceOf(ThrottlerStorageService);

        expect(mockRedisInstances[0].disconnect).not.toHaveBeenCalled();

        await moduleRef.close();

        expect(mockRedisInstances).toHaveLength(1);
        expect(mockRedisInstances[0].disconnect).toHaveBeenCalledTimes(1);
      },
    );
  });

  it('repeated production module close triggers Redis shutdown exactly once, does not throw, and creates no additional client', async () => {
    await withEnv(
      {
        NODE_ENV: 'production',
        THROTTLE_REDIS_URL: 'redis://localhost:6379',
      },
      async () => {
        const moduleRef = await Test.createTestingModule({
          imports: [AppModule],
        }).compile();

        await expect(moduleRef.close()).resolves.not.toThrow();
        await expect(moduleRef.close()).resolves.not.toThrow();
        await expect(moduleRef.close()).resolves.not.toThrow();

        expect(mockRedisInstances).toHaveLength(1);
        expect(mockRedisInstances[0].disconnect).toHaveBeenCalledTimes(1);
      },
    );
  });

  it('failed production connection constructs exactly one partial client, disconnects it exactly once, rejects module compilation, and never initializes an HTTP app', async () => {
    await withEnv(
      {
        NODE_ENV: 'production',
        THROTTLE_REDIS_URL: 'redis://localhost:6379',
      },
      async () => {
        nextConnectImpl = async () => {
          throw new Error('ECONNREFUSED');
        };

        let httpAppInitialized = false;
        let compileError: Error | null = null;
        try {
          const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
          }).compile();
          httpAppInitialized = true;
          await moduleRef.close();
        } catch (err) {
          compileError = err as Error;
        }

        expect(httpAppInitialized).toBe(false);
        expect(compileError).not.toBeNull();
        expect(compileError!.message).toMatch(/Redis throttle connection failed/);

        expect(mockRedisInstances).toHaveLength(1);
        expect(mockRedisInstances[0].disconnect).toHaveBeenCalledTimes(1);
      },
    );
  });

  it('the runtime storage selected in production is Redis-backed, not in-memory', async () => {
    await withEnv(
      {
        NODE_ENV: 'production',
        THROTTLE_REDIS_URL: 'redis://localhost:6379',
      },
      async () => {
        const moduleRef = await Test.createTestingModule({
          imports: [AppModule],
        }).compile();

        const storage = moduleRef.get<ThrottlerStorage>(ThrottlerStorage);
        expect(storage.constructor.name).toBe('ThrottlerStorageRedisService');

        await moduleRef.close();
      },
    );
  });

  it('never logs or throws the raw THROTTLE_REDIS_URL or a hostile upstream error containing credentials', async () => {
    const hostileUrl = 'redis://:supersecretpassword@localhost:6379';

    await withEnv(
      {
        NODE_ENV: 'production',
        THROTTLE_REDIS_URL: hostileUrl,
      },
      async () => {
        nextConnectImpl = async () => {
          // Simulate an ioredis error whose own message embeds the
          // connection string (as some real ioredis error variants do),
          // to prove sanitization strips it rather than merely never
          // constructing a message that happens not to include it.
          throw new Error(`connect ECONNREFUSED ${hostileUrl}`);
        };

        const logSpy = jest.spyOn(console, 'log').mockImplementation();
        const errorSpy = jest.spyOn(console, 'error').mockImplementation();
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

        let compileError: Error | null = null;
        try {
          await Test.createTestingModule({ imports: [AppModule] }).compile();
        } catch (err) {
          compileError = err as Error;
        }

        const allLoggedText = [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls]
          .flat()
          .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
          .join('\n');

        logSpy.mockRestore();
        errorSpy.mockRestore();
        warnSpy.mockRestore();

        expect(compileError).not.toBeNull();
        expect(compileError!.message).not.toContain('supersecretpassword');
        expect(compileError!.message).not.toContain(hostileUrl);
        expect(compileError!.message).toBe('Redis throttle connection failed.');

        expect(allLoggedText).not.toContain('supersecretpassword');
        expect(allLoggedText).not.toContain(hostileUrl);

        expect(mockRedisInstances).toHaveLength(1);
        expect(mockRedisInstances[0].disconnect).toHaveBeenCalledTimes(1);
      },
    );
  });
});
