import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { JwtService, SigningKey } from './jwt.service';
import { RateLimiterService } from './rate-limiter.service';
import { RolesGuard } from './roles.guard';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Security foundation (Security Model). Wires JWT signing/verification,
 * RBAC guard, and the Redis-backed rate limiter. No authentication flows
 * (OTP/Google/Apple) live here — those are Identity Context business logic,
 * out of scope for Phase 2 (docs/21-phase2-foundation-audit.md).
 */
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (): Redis => {
        const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
        return new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
      },
    },
    {
      provide: JwtService,
      useFactory: (): JwtService => {
        const activeKid = process.env.JWT_ACTIVE_KID ?? 'dev-key-1';
        const secret = process.env.JWT_SECRET ?? 'dev-only-insecure-secret-change-me';
        const keys: SigningKey[] = [{ kid: activeKid, secret }];
        return new JwtService(keys, activeKid);
      },
    },
    {
      provide: RateLimiterService,
      useFactory: (redis: Redis): RateLimiterService => new RateLimiterService(redis),
      inject: [REDIS_CLIENT],
    },
    RolesGuard,
  ],
  exports: [JwtService, RateLimiterService, RolesGuard, REDIS_CLIENT],
})
export class SecurityModule {}
