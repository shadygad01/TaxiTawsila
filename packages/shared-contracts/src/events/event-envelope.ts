/**
 * Domain event envelope (Domain Model §12; ADR-0011, revised by ADR-0023).
 *
 * This is the shape every module publishes through the transactional outbox and
 * every consumer receives — NOT the outbox table's own persistence columns
 * (see apps/backend/src/platform/outbox), but the logical envelope a domain
 * event is wrapped in before it becomes an outbox row.
 */
export interface DomainEventEnvelope<TPayload = unknown> {
  /** e.g. 'TripCompleted', 'TripVerified' — matches platform.outbox.event_type */
  readonly eventType: string;
  /** Payload-shape version (ADR-0023) — bump whenever this event's payload shape changes. */
  readonly eventVersion: number;
  readonly aggregateType: string;
  readonly aggregateId: string;
  /** Propagated from the originating request's trace context (ADR-0027). */
  readonly correlationId: string;
  readonly occurredAt: Date;
  readonly payload: TPayload;
}

/**
 * Named, registered consumer identity used as the idempotency key alongside the
 * outbox row's own id in platform.event_consumption_log (ADR-0023) — never
 * derived from (eventType, aggregateId) alone, since that would incorrectly
 * deduplicate a second, legitimate event for the same aggregate (e.g. a
 * post-CORRECTED Data Quality re-assessment, ADR-0020).
 */
export type EventConsumerName = string;
