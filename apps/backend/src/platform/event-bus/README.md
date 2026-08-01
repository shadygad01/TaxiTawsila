# Event Bus / Transactional Outbox

Implements ADR-0011 (durable event delivery), ADR-0023 (event versioning, ordering, corrected idempotency), and ADR-0024 (dead-letter handling).

- `entities/` — TypeORM mappings for `platform.outbox`, `platform.outbox_dead_letter`, `platform.event_consumption_log`, `platform.provenance_log` (Database Schema §1.1).
- `outbox-publisher.service.ts` — the only way to publish a domain event; requires the caller's own `EntityManager` so the outbox insert is provably in the same transaction as the state change it describes.
- `event-consumer.ts` — the interface a module implements to consume events (`name`, `handles()`, `handle()`).
- `outbox-relay.service.ts` — drains undispatched rows, dispatches to every applicable registered consumer, skips already-processed `(consumerName, outboxEventId)` pairs, and moves a row to dead-letter after `maxAttempts` failed passes — with a `outbox_dead_letter_total` Prometheus counter any alerting rule can page on (Pre-Implementation Audit §7).

**What's real vs. deferred:** the mechanism is fully implemented and tested (unit tests mock repositories to exercise the idempotency/retry/dead-letter branches in isolation; an integration test runs the real flow against the live Postgres schema). What's deferred to Phase 3+: any actual business event (`TripCompleted`, `TripVerified`, etc.) and any registered consumer — there is no business logic in this repository yet to publish or consume. `EventBusModule` exports `OutboxRelayService` pre-wired with zero consumers; a later module adds its `EventConsumer` and re-provides `OutboxRelayService` with it appended, or the module is refactored to accept consumers via `forRoot`-style registration once there's more than one real consumer to coordinate.
