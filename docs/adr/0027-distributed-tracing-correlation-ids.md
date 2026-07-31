# ADR-0027: Distributed Tracing and Correlation-ID Propagation From Day One

**Status:** Accepted

## Context

The Pre-Implementation Audit found that no document in the entire set mentions distributed tracing, despite the platform's reliability story now depending on an async chain spanning at least four bounded contexts per trip: Trip → Outbox → {Trust, Data Quality} → Outbox → Reward, each potentially running on a different worker at a different time. Without tracing, answering "why didn't this specific trip earn a reward" requires manually correlating logs across multiple modules by timestamp and `tripId` guesswork — a slow, error-prone process that gets materially worse as more parallel consumers are added (Data Quality was only just added as a second consumer of `TripCompleted`; more will likely follow). This is foundational observability infrastructure, and retrofitting correlation IDs into an event contract that's already in production (Phase 3+) means touching every module's event-publishing code a second time.

## Decision

- Every inbound request generates or propagates a `correlationId` (a trace ID, compatible with OpenTelemetry's trace-context conventions), attached to the request context from the API Gateway layer inward.
- `platform.outbox` gains a `correlation_id UUID` column, populated from the originating request's trace context at the moment an event is written (same transaction as the event itself) — so the *entire* async chain a single user action triggers (trip completion → trust scoring → data quality scoring → reward grant) shares one correlation ID from end to end, even across process/worker boundaries and the eventual-consistency delay between them.
- Structured logs (already mandated, Architecture §9) include `correlationId` on every line touching a request or an outbox-triggered consumption, enabling a single log query to reconstruct a trip's full journey without tracing infrastructure as a hard prerequisite — tracing and correlation-ID-tagged logs are complementary, not substitutes for each other.
- OpenTelemetry instrumentation (or an equivalent tracing SDK) is adopted from Phase 3 (Core Platform), not deferred — the same "decide the mechanism now, scale the infrastructure later" discipline already applied to the outbox and rate limiting.

## Consequences

- **Positive:** any trip's full async journey, across every consumer that ever touches it, is reconstructable from one correlation ID — the single most valuable tool for diagnosing "why didn't X happen" incidents, which are the dominant failure mode of an event-driven, eventually-consistent design; instrumentation is designed in from the first module rather than bolted on after enough incidents make its absence painful.
- **Negative:** every module's event-publishing and logging code needs trace-context awareness from day one (a small, consistent discipline, not a large one); a tracing backend (self-hosted Jaeger/Tempo, or a hosted option) becomes another piece of infrastructure to run and monitor — kept deliberately generic (OpenTelemetry-compatible) so the backend choice itself stays swappable, consistent with the platform's general Provider Abstraction philosophy even though this is operational rather than domain infrastructure.
