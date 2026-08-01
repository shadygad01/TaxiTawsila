import { Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

/**
 * Redis-backed distributed rate limiting (ADR-0013). Fixed-window counter per
 * key, shared across every backend instance — the correctness property
 * Architecture Review §20/§21 flagged as missing from an in-memory-only
 * limiter (which silently under-counts abuse the moment a second instance is
 * deployed).
 *
 * `maxRequests`/`windowSeconds` are passed in by the caller rather than
 * hardcoded here — they come from `config.rate_limit_config` (Database Schema
 * §2) once the Configuration module exposes it; this service is the mechanism,
 * not the policy.
 *
 * Fails closed: if Redis is unreachable, `checkLimit` denies rather than
 * allowing unlimited traffic through (Security Model §5).
 */
@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);

  constructor(private readonly redis: Redis) {}

  async checkLimit(key: string, maxRequests: number, windowSeconds: number): Promise<RateLimitDecision> {
    const redisKey = `ratelimit:${key}`;
    try {
      const count = await this.redis.incr(redisKey);
      if (count === 1) {
        await this.redis.expire(redisKey, windowSeconds);
      }
      const ttl = await this.redis.ttl(redisKey);
      const resetSeconds = ttl >= 0 ? ttl : windowSeconds;
      return {
        allowed: count <= maxRequests,
        remaining: Math.max(0, maxRequests - count),
        resetSeconds,
      };
    } catch (error) {
      this.logger.error(`Rate limiter Redis failure for key "${key}" — failing closed`, error as Error);
      return { allowed: false, remaining: 0, resetSeconds: windowSeconds };
    }
  }
}
