# ADR-0022: Explicit Provenance Metadata on Every Computed Value That Feeds a Downstream Decision

**Status:** Accepted

## Context

The platform's core asset is trustworthy transportation data (PRD §1–2). A stored value (an estimated fare, a traffic estimate, a trust score, a data quality score, a reward grant) is only as trustworthy as the ability to answer "where did this number come from, and can I reproduce it." Phase 1 partially addressed this for Trust (`rule_set_version`) but had no general pattern, and left gaps: reward ledger entries didn't reference which reward policy produced them; fare/traffic estimates had no source tagging at all.

## Decision

Every value meeting this description gets a `Provenance` value object — `{ source: <enum>, producedByVersion: <string>, computedAt: <timestamp> }` — stored as a JSONB column alongside the value, **plus** a row in an append-only `platform.provenance_log` table (same schema-design family as `platform.outbox`, ADR-0011) recording every write or correction to that value over time. Concretely: `trip.trip.estimated_fare_provenance` (source: `FARE_FORMULA`/`HISTORICAL_MODEL`/`MANUAL_OVERRIDE`, version: `fare_policy_version_id`), `trip.trip.traffic_estimate_provenance` (source: `TIME_BASED`/`HISTORICAL_STATISTICAL`/`LIVE_TRAFFIC_PROVIDER`, version: `TrafficProvider` adapter version), `trust.trip_trust_assessment.engine_version` (new column, alongside the existing `trust_config_id`), `dataquality.data_quality_assessment.engine_version` (alongside `quality_config_id`), `reward.reward_ledger_entry.reward_rule_config_id` (new FK, closing a Phase-1 gap). A value produced or overwritten by a Manual Review Queue "Corrected" action (ADR-0020) is provenance-tagged `MANUAL_OVERRIDE`, distinguishing it permanently from an original automated measurement.

## Consequences

- **Positive:** any stored value's origin is queryable without archaeology through code history; the `provenance_log` gives a full timeline even across corrections, which the inline JSONB column (current-value-only) can't; this is a precondition for defensible dispute resolution (a rider or merchant asking "why was I charged/scored this") and for trusting the dataset as ML training input.
- **Negative:** additional column and log-table writes on every provenance-bearing value's creation/correction (cheap — same transaction, same append-only philosophy already used elsewhere); requires code-review discipline (Coding Standards, amended) to add a provenance column whenever a new computed value is introduced, rather than a mechanism that enforces it automatically at the framework level.
