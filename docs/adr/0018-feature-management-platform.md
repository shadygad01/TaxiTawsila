# ADR-0018: Feature Management Platform as an Independent Bounded Context

**Status:** Accepted (supersedes the flat `config.feature_flag` boolean design; see Architecture Review §19, previously accepted "as-is for MVP")

## Context

Architecture Review §19 correctly judged a flat boolean flag adequate through the 10,000-MAU/single-city band, and explicitly deferred percentage rollout/segment targeting as a "later" enhancement. This extension's requirements make that later point now: percentage rollouts, environment scoping, kill switches, city-based features, user segments, internal testing cohorts, and A/B experiments are all mandatory. This is materially more domain logic (deterministic bucketing, segment-membership evaluation, variant assignment) than a settings toggle, which justifies its own bounded context rather than a few extra columns on `config.feature_flag`.

## Decision

Feature Management becomes its own bounded context, schema `feature`, containing `feature_flag` (toggle/percentage-rollout/kill-switch/experiment-linked), `feature_segment` (declarative JSONB membership rules), `feature_experiment` + `feature_exposure_log` (weighted variants, append-only first-exposure-sticky exposure tracking). Percentage rollout and experiment-variant assignment both use **stateless deterministic hashing** (`hash(riderId/deviceAnonId, flagKey or experimentKey) % 100`) rather than a stored per-rider assignment table for plain rollouts — the same rider always lands in the same bucket without a write, and increasing a rollout percentage only ever adds riders, never reshuffles existing ones. Kill switches reuse the Redis pub/sub immediate-invalidation channel already specified for `TrustThresholdConfig` in ADR-0013, rather than inventing a second propagation mechanism.

## Consequences

- **Positive:** closes a mandatory requirement with one coherent design; kill switches propagate in seconds, not within the ordinary 10–30s config TTL; deterministic bucketing means rollout percentage changes are safe and predictable to operate.
- **Negative:** one more bounded context/schema to maintain; segment-rule evaluation (JSONB predicate against rider attributes) must stay cheap enough to run on the hot request path — enforced by keeping segment rules limited to already-available rider attributes (kind, trust-score band, explicit allowlist), never a query that scans the full rider table per resolution.
- **Explicitly not built now (see Platform Extensions §2.4):** client-side flag SDKs with local persistent bucketing, multi-armed-bandit auto-optimization, scheduled automatic rollout ramping — legitimate future capabilities, not required by any current PRD need, and the kind of speculative complexity the Architecture Review already flagged once for the Advertising Engine.
