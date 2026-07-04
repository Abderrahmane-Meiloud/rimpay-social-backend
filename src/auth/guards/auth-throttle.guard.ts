import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';

// Production rate limits. Login is stricter than refresh.
// Production (NODE_ENV=production) always uses a real Redis-backed
// ThrottlerStorage (see throttler-storage.factory.ts), configured via
// THROTTLE_REDIS_URL. The default in-memory storage is used only in
// development and test.
// Reverse-proxy deployments must configure TRUST_PROXY_HOPS to ensure
// accurate IP-based rate limiting without trusting arbitrary
// X-Forwarded-For headers (see main.ts).
const LOGIN_LIMIT = 5;
const REFRESH_LIMIT = 10;
const TTL_MS = 60_000;

@Injectable()
export class AuthThrottleGuard implements CanActivate {
  constructor(
    @Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      ip?: string;
      route?: { path?: string };
      path?: string;
    }>();

    const routePath: string =
      (req.route?.path as string) ?? req.path ?? '';

    let limit: number;

    if (routePath.includes('login')) {
      limit = LOGIN_LIMIT;
    } else if (routePath.includes('refresh')) {
      limit = REFRESH_LIMIT;
    } else {
      return true;
    }

    const ip = req.ip ?? 'unknown';
    const key = `auth-throttle:${ip}:${routePath}`;

    const result = await this.storage.increment(key, TTL_MS, limit, TTL_MS, 'default');

    if (result.totalHits > limit) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}
