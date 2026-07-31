# ADR-0024: Outbox Dead-Letter Queue and Max-Retry Policy

**Status:** Accepted

## Context

`platform.outbox` tracks `attempts` but no document ever defined a ceiling, a dead-letter destination, or an alert for a poison event (one whose consumer handler fails every time, e.g., a payload edge case the handler doesn't account for). Without this, a failing event either retries forever (quietly consuming relay capacity and potentially blocking per-aggregate ordering for that aggregate under ADR-0023's partitioned-claim scheme) or is dropped with no operator visibility if a retry cap is improvised later without a defined destination — precisely the "silently dropped event" failure mode the transactional outbox (ADR-0011) was built to eliminate.

## Decision

Each outbox row gets a `max_attempts` policy (a platform-wide default, overridable per `event_type` via configuration if a specific consumer needs a different tolerance — e.g., Trust/Data Quality scoring might warrant more retries than a best-effort analytics event). On exceeding `max_attempts`, the relay moves the row to `platform.outbox_dead_letter` (same payload/event_type/aggregate fields, plus `failed_at`, `last_error`, `total_attempts`) and removes it from the active dispatch queue, and fires an alert (a dead-lettered event is, by definition, something a human must look at — see Deployment Strategy/Architecture monitoring update). A dead-lettered event can be manually re-queued by an operator (a defined admin action, audit-logged) once the underlying consumer bug is fixed, rather than requiring a database-level manual `INSERT` to recover.

## Consequences

- **Positive:** a poison event now has a defined, bounded failure mode with operator visibility, instead of either infinite silent retry or an undefined drop; recovery is a deliberate, audited admin action, not an ad hoc database fix.
- **Negative:** one more table and one more alert condition to operate; requires picking a sensible default `max_attempts` (a starting value, tunable without a deploy since it's config-driven) before Phase 3 ships the relay.
- **Relationship to ADR-0011/ADR-0023:** this is the missing failure-mode half of the outbox design; durability (0011) and correctness of ordering/idempotency (0023) both assumed retries eventually succeed — this ADR is what happens when they don't.
