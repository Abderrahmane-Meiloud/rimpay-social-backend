/**
 * Proves that the real bootstrap path in src/main.ts explicitly activates
 * Nest's graceful shutdown hooks for SIGTERM and SIGINT, so that
 * onModuleDestroy/onApplicationShutdown (e.g. RedisThrottleClient's Redis
 * disconnect) run on process termination instead of the process exiting
 * abruptly.
 *
 * NestFactory.create, @nestjs/swagger, and AppModule are all mocked so
 * this test never boots the real application graph, never touches a
 * database, and never listens on a real port. No Redis URL, JWT secret,
 * database URL, or other credential is referenced anywhere in this file.
 */

const enableShutdownHooks = jest.fn().mockReturnThis();
const listen = jest.fn().mockResolvedValue(undefined);
const useGlobalPipes = jest.fn().mockReturnThis();
const enableCors = jest.fn().mockReturnThis();
const use = jest.fn().mockReturnThis();
const set = jest.fn().mockReturnThis();
const get = jest.fn().mockReturnValue({
  get: jest.fn().mockReturnValue(undefined),
});

const fakeApp = {
  enableShutdownHooks,
  listen,
  useGlobalPipes,
  enableCors,
  use,
  set,
  get,
};

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn().mockResolvedValue(fakeApp),
  },
}));

jest.mock('@nestjs/swagger', () => ({
  DocumentBuilder: jest.fn().mockImplementation(() => ({
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setVersion: jest.fn().mockReturnThis(),
    addBearerAuth: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({}),
  })),
  SwaggerModule: {
    createDocument: jest.fn().mockReturnValue({}),
    setup: jest.fn(),
  },
}));

jest.mock('../src/app.module', () => ({
  AppModule: class FakeAppModule {},
}));

describe('main.ts bootstrap — process-signal shutdown (P0)', () => {
  beforeAll(async () => {
    await import('../src/main');
    // bootstrap() is invoked at module load and awaits internally; give
    // its internal promise chain a tick to resolve before assertions.
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('calls enableShutdownHooks with SIGTERM and SIGINT explicitly registered', () => {
    expect(enableShutdownHooks).toHaveBeenCalledTimes(1);
    expect(enableShutdownHooks).toHaveBeenCalledWith(['SIGTERM', 'SIGINT']);
  });

  it('calls enableShutdownHooks before the app starts listening', () => {
    const shutdownHooksOrder =
      enableShutdownHooks.mock.invocationCallOrder[0];
    const listenOrder = listen.mock.invocationCallOrder[0];
    expect(shutdownHooksOrder).toBeLessThan(listenOrder);
  });
});
