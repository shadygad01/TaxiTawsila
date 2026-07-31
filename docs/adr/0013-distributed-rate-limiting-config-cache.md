# ADR-0013: Redis-Backed Distributed Rate Limiting and Config Cache Invalidation

**Status:** Accepted

## Context

The original Security Model and Scalability Plan specified rate limiting and "current effective config" caching without stating where state lives. An in-memory-per-instance implementation of either is a silent single-instance assumption: it is correct with one backend instance and **incorrect** the moment a second instance is added, which the platform's own stateless-horizontal-scaling design (Architecture §2, Scalability Plan §2) makes an expected, not exotic, event — likely at or before the 10,000 MAU capacity milestone. An under-counting rate limiter directly weakens OTP-spam and fake-trip-generation defenses; a stale config cache can serve different fare/trust rules from different instances during the propagation window after an admin change.

## Decision

- **Rate limiting** (OTP request/verify, trip creation, GPS ping ingestion, ad-serve) uses Redis-backed shared counters (e.g., token bucket/sliding window keyed by IP + device/rider ID), not per-instance in-memory counters, from the first implementation — not added later when a second instance is deployed.
- **Configuration caching**: "current effective version" lookups for `FareRuleSet`/`RewardRuleConfig` use a short TTL cache (10–30s), tolerable given these are admin-driven, infrequent changes with a low cost to a few seconds of staleness. `TrustThresholdConfig` additionally uses pub/sub invalidation (a lightweight Redis pub/sub broadcast on publish of a new version) given its relevance to active-incident response, where several seconds of stale threshold could matter during a fraud attack.

## Consequences

- **Positive:** rate limiting is correct under horizontal scaling from day one; config propagation is bounded and predictable; no retrofit required when instance count grows.
- **Negative:** introduces a hard dependency on Redis being available for both security-critical (rate limiting) and correctness-critical (config resolution) paths — Redis unavailability must fail closed for rate limiting (deny/throttle) rather than fail open (unlimited), and config resolution must have a safe fallback (last-known-good cached version) rather than erroring the request.
