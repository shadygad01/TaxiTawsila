import Redis from 'ioredis';
import { RateLimiterService } from '../../../../src/common/security/rate-limiter.service';

/**
 * Integration test against a real Redis instance (Testing Strategy §2 — no
 * mocked infra for anything that has real network/timing behavior worth
 * verifying, and a fixed-window counter's correctness genuinely depends on
 * real INCR/EXPIRE semantics, not a mock of them).
 */
describe('RateLimiterService (integration)', () => {
  let redis: Redis;
  let service: RateLimiterService;

  beforeAll(() => {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    service = new RateLimiterService(redis);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('allows requests up to the configured max within the window', async () => {
    const key = `test:${Date.now()}:${Math.random()}`;
    const first = await service.checkLimit(key, 3, 60);
    const second = await service.checkLimit(key, 3, 60);
    const third = await service.checkLimit(key, 3, 60);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it('denies requests beyond the configured max within the window', async () => {
    const key = `test:${Date.now()}:${Math.random()}`;
    await service.checkLimit(key, 1, 60);
    const second = await service.checkLimit(key, 1, 60);

    expect(second.allowed).toBe(false);
    expect(second.remaining).toBe(0);
  });

  it('uses independent counters per key', async () => {
    const keyA = `test:a:${Date.now()}`;
    const keyB = `test:b:${Date.now()}`;
    await service.checkLimit(keyA, 1, 60);

    const resultForB = await service.checkLimit(keyB, 1, 60);
    expect(resultForB.allowed).toBe(true);
  });
});
