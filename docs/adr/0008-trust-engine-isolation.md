# ADR-0008: Trust Engine as an Independently-Boundaried Module (Extraction-Ready)

**Status:** Accepted

## Context

The Trust Engine is the platform's core integrity mechanism — it must never be bypassed, must be independently auditable, and its scoring logic will evolve rapidly (new fraud signals, tuning) independent of Trip/Reward release cycles. It is also the most likely candidate for extraction into its own service if scoring becomes computationally heavy (e.g., ML-based anomaly detection) or needs independent scaling.

## Decision

The Trust module never reads or writes the `Trip` aggregate directly and never receives direct HTTP calls from client apps. It reacts only to a `TripCompleted` domain event and publishes `TripVerified`/`TripRejected` events; its own `trust` schema and `TripTrustAssessment` aggregate are the sole source of truth for verdicts. `TrustSignalEvaluator` implementations are composed as an ordered, independently unit-tested pipeline. Rewards may only be granted in reaction to a `TripVerified` event — never by directly reading the `Trip` aggregate's fare fields.

## Consequences

- **Positive:** Trust logic can be extracted into its own deployable service later purely by moving the event bus from in-process to a real broker (Redis Streams/RabbitMQ) — no domain rewrite. Structural impossibility of "granting rewards without trust approval" (Reward module has no code path to do so).
- **Negative:** introduces eventual consistency (a short delay between trip completion and trust verdict) that the UI must design for (e.g., "verifying your trip..." state) rather than an instant reward.
- **Related:** see ADR-0002 for the general modular-monolith extraction path.
