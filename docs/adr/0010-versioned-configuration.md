# ADR-0010: Versioned, Append-Only Configuration for Fare/Trust/Reward Rules

**Status:** Accepted

## Context

Fare rules, trust thresholds, and reward rules must be admin-editable without deploys, but every historical trip must remain auditable against the exact rules that were in force when it was evaluated — both for dispute resolution and for the integrity of the ML-ready dataset (labels must not silently drift when config later changes).

## Decision

`FareRuleSet`, `TrustThresholdConfig`, and `RewardRuleConfig` are modeled as versioned, append-only aggregates keyed by `(cityId, effectiveFrom)`. Admin edits always insert a new version; the application resolves "current" as the latest version with `effectiveFrom <= now()`. Every `Trip` and `TripTrustAssessment` stores an explicit foreign key to the exact config version used, not a "current" pointer.

## Consequences

- **Positive:** full reproducibility of any historical fare estimate or trust verdict; safe A/B or gradual rollout of rule changes by city; no destructive edits to worry about in migrations.
- **Negative:** slightly more complex read path (resolve "latest effective version" rather than a single row) and unbounded table growth for config history — acceptable given low write frequency (admin-driven, not per-trip).
