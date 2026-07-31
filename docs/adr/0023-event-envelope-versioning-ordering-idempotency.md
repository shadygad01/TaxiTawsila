# ADR-0023: Event Envelope Versioning, Per-Aggregate Ordering, and Corrected Idempotency Keying

**Status:** Accepted (revises the outbox contract from ADR-0011)

## Context

The Pre-Implementation Audit found three compounding gaps in the transactional outbox (ADR-0011): (1) no schema-version field on published events, making a future payload shape change unsafe to roll out; (2) no defined ordering guarantee once the relay is horizontally scaled (Scalability Plan already anticipates this), risking out-of-order processing for events belonging to the same aggregate; (3) idempotency specified as keyed on `(event_type, aggregate_id)`, which is actively wrong — Data Quality's `CORRECTED` review resolution legitimately re-fires a `DataQualityAssessed` event for the same trip (ADR-0020), and that keying scheme would silently discard the second, legitimate assessment as a "duplicate."

## Decision

**Event versioning:** every `platform.outbox` row gets an `event_version INT NOT NULL DEFAULT 1`. A payload shape change for an existing `event_type` requires a version bump; consumers branch on `(event_type, event_version)` to interpret the payload, exactly mirroring how `config.*` versioning already protects against silent business-rule drift (ADR-0017) — now applied to event *shapes*, not just business *values*.

**Ordering:** the relay, when scaled to multiple workers, claims rows via `SELECT ... FOR UPDATE SKIP LOCKED` **partitioned by a hash of `aggregate_id`** (e.g., each worker owns a fixed subset of hash buckets) rather than naive first-available polling — guaranteeing all events for a given aggregate are claimed and dispatched by the same worker in `created_at` order, while different aggregates' events still process fully in parallel across workers. At MVP (one relay worker) this reduces to the existing simple poll; the partitioning discipline is designed in now specifically so scaling the relay later is a configuration change (worker count / bucket count), not a rewrite of the claiming logic.

**Idempotency (the corrected mechanism):** a new table, `platform.event_consumption_log (consumer_name, outbox_event_id, processed_at, PRIMARY KEY (consumer_name, outbox_event_id))`, records that a specific named consumer (e.g., `'trust-engine'`, `'data-quality-engine'`, `'reward-engine'`) has processed a specific outbox row **by that row's own unique `id`** — never by `(event_type, aggregate_id)`. Two distinct outbox rows for the same `tripId` and the same `event_type` (e.g., two `DataQualityAssessed` events — the original and the post-correction re-assessment) are two distinct, both-legitimate entries in this log, each processed exactly once. A consumer's processing transaction inserts into `event_consumption_log` and applies its side effect atomically; a redelivery (crash-and-retry, or a backup/restore replay — see Replay Safety below) is detected by a conflict on this table's primary key and skipped, not by inspecting the business payload.

**Replay safety, as a consequence:** because idempotency is now keyed on the outbox row's own durable identity rather than a derived business tuple, replaying already-dispatched rows after a backup restore is safe by construction — `event_consumption_log` already contains the prior processing record for any row that was genuinely processed before the backup was taken, so a replay is recognized and skipped exactly like an ordinary at-least-once redelivery.

## Consequences

- **Positive:** closes a real, previously-shipped design bug (the old idempotency key would have silently dropped legitimate re-assessments the moment Phase 6 code exercised the `CORRECTED` review path); makes the relay's future horizontal-scaling story concrete instead of assumed; makes event payload evolution a normal, safe operation instead of an unplanned breaking change.
- **Negative:** one more table (`event_consumption_log`) written on every event consumption, and it grows with (event count × consumer count) — same append-only/partitioning discipline as the rest of `platform` schema applies (see Database Schema update); consumers must be named/registered identifiers, not anonymous handlers, adding minor bookkeeping.
- **Supersedes:** ADR-0011's idempotency guidance ("idempotent per `(event_type, aggregate_id)`") is replaced by the mechanism above; ADR-0011's durability guarantee (transactional outbox itself) is unchanged and reaffirmed.
