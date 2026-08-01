# Logging & Correlation IDs

- `correlation-id.middleware.ts` / `correlation-id.context.ts` — every request gets a `correlationId` (ADR-0027), reused from an inbound `x-correlation-id` header if present, stored in `AsyncLocalStorage` for the life of the request.
- `logger.module.ts` — structured JSON logging (pino), every line tagged with the current `correlationId`, with a redaction list for known-sensitive fields (Security Model §4).

**Not yet wired here:** the same `correlationId` propagating into `platform.outbox.correlation_id` (ADR-0027) — that happens when the Outbox publish path is called from a real use case (Phase 3+), since there's no domain event to publish yet in Phase 2. The `event-bus` module's `OutboxEntry` entity already has the column ready (see `src/platform/event-bus`).
