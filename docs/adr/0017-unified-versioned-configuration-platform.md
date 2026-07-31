# ADR-0017: Unified Versioned Configuration Platform Pattern (Generalizes ADR-0010)

**Status:** Accepted (supersedes ADR-0010's scope, keeps its mechanism)

## Context

ADR-0010 established versioned, append-only configuration for three aggregates (`FareRuleSet`, `TrustThresholdConfig`, `RewardRuleConfig`). The mandatory Configuration Platform extension requires the same discipline applied to a much larger inventory: GPS thresholds, fraud thresholds, advertising targeting defaults, rate limits, data-quality thresholds/weights, and daily reward limits — plus an explicit, admin-usable rollback capability that ADR-0010 didn't specify a UX for.

## Decision

Every configuration aggregate in the Configuration Platform (`config` schema) and Fare Policy Context (`farepolicy` schema, ADR-0021) follows one shape: `effective_from` (resolves "current" as the latest row with `effective_from <= now()`), `status` (`DRAFT`/`ACTIVE`/`SUPERSEDED`), append-only (no in-place `UPDATE` of a published version), every publish audit-logged via the existing `admin.audit_log_entry` mechanism, and **rollback modeled as publishing a new version that copies a prior version's field values**, tagged with an explicit `rolled_back_from` reference — never a destructive revert. The full inventory this pattern now covers: `FarePolicyVersion`, `TrustThresholdConfig`, `RewardRuleConfig`, `GpsThresholdConfig`, `FraudThresholdConfig`, `AdvertisingTargetConfig`, `RateLimitConfig`, `DataQualityThresholdConfig`.

## Consequences

- **Positive:** one mental model and one implementation pattern (a shared abstract repository/service, not copy-pasted per aggregate) across every tunable business rule in the platform; rollback is a one-click admin action with zero history loss; every past decision (fare charged, trip verified, reward paid, trip deemed dataset-ready) remains reproducible against the exact version in force at the time.
- **Negative:** each new configurable value requires slightly more schema ceremony (a full versioned table, not a single mutable settings row) — an accepted, deliberate cost given the reproducibility requirement is non-negotiable for this platform (PRD's core thesis is that accumulated trip data is the asset; ungoverned config drift would corrupt that asset's integrity retroactively).
- **Relationship to ADR-0010:** ADR-0010 is not reversed, only generalized; existing `FareRuleSet`/`TrustThresholdConfig`/`RewardRuleConfig` continue to follow this shape, now formally extended to the rest of the inventory.
