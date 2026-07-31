# ADR-0011: Transactional Outbox for Domain Event Delivery

**Status:** Accepted (supersedes the implicit "in-process EventEmitter, broker later" plan in ADR-0002/ADR-0008)

## Context

ADR-0008 makes the Trust/Reward integrity guarantee depend entirely on the Trust module reliably receiving every `TripCompleted` event. The original plan used an in-process event bus (Nest `EventEmitter`), with a stated intention to move to a real broker "if/when modules are extracted into services." An in-process emitter has no durability: if the process crashes, redeploys, or a handler throws between the triggering transaction's commit and event consumption, the event is gone with no retry or dead-letter path. This is a correctness gap, not a scaling gap — it is exactly as bad at 100 users as at 1,000,000.

## Decision

Every domain event publish is written to an `outbox` table in the **same database transaction** as the state change that produced it (e.g., `Trip.status = COMPLETED` and the `TripCompleted` outbox row commit atomically). A relay process reads unprocessed outbox rows and dispatches them to consumers — in-process at MVP (a polling worker), swapped for a real broker or CDC relay later purely as a change to what drains the outbox, not to the write-side contract or to consumers. Consumers must be idempotent per event (keyed by `tripId`/event ID), since outbox delivery is at-least-once.

## Consequences

- **Positive:** a completed trip's trust evaluation (and any other cross-module domain event) can never be silently dropped by a crash or redeploy; the event contract and consumer interfaces don't change when the relay mechanism is upgraded from a poller to a broker later.
- **Negative:** one extra table write per published event (cheap, same transaction); requires a small relay/poller component to build, deploy, and monitor from Phase 3 onward rather than deferring it; consumers must be written idempotently from day one.
- **Supersedes:** the "in-process now, real broker later" framing in ADR-0002 §"Internal Event Bus" description — the outbox is the actual mechanism from day one; only the drain mechanism changes over time.
