# Configuration Context

Phase 2 scope (docs/21-phase2-foundation-audit.md): the reusable **mechanism**, not any concrete business rule.

- `domain/versioned-config-record.ts`, `domain/versioned-config-store.ts`, `domain/versioned-config.service.ts` — the generic ADR-0017/ADR-0026 state machine (publish, resolve-with-tie-break, dual-control approve, rollback-as-new-version). Framework-free; unit-tested against an in-memory fixture store (`test/unit/modules/configuration`), not any real config table, since no concrete business config aggregate is implemented yet.
- `infrastructure/city.entity.ts`, `infrastructure/city.service.ts` — `config.city`, the one piece of real reference data every other schema's `city_id` FK depends on. Not versioned (City has no DRAFT/ACTIVE lifecycle).

**Deferred to later phases, by design:** `TrustThresholdConfig`, `FraudThresholdConfig`, `GpsThresholdConfig`, `DataQualityThresholdConfig` (high-risk, dual-control), `RewardRuleConfig`, `AdvertisingTargetConfig`, `RateLimitConfig`, and `FarePolicyVersion` (its own bounded context, `modules/farepolicy`) all plug into `VersionedConfigService` once their owning module is built — this is precisely why the framework is generic rather than copy-pasted per aggregate.
