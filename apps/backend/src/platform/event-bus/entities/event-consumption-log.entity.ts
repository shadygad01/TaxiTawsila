import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * platform.event_consumption_log (ADR-0023). The corrected idempotency
 * mechanism — keyed on the outbox row's OWN identity per named consumer,
 * never on (event_type, aggregate_id), which would wrongly deduplicate a
 * second, legitimate event for the same aggregate (e.g. a post-CORRECTED
 * Data Quality re-assessment, ADR-0020).
 */
@Entity({ name: 'event_consumption_log', schema: 'platform' })
export class EventConsumptionLogEntity {
  @PrimaryColumn({ name: 'consumer_name', type: 'text' })
  consumerName!: string;

  @PrimaryColumn({ name: 'outbox_event_id', type: 'bigint' })
  outboxEventId!: string;

  @Column({ name: 'processed_at', type: 'timestamptz', default: () => 'now()' })
  processedAt!: Date;
}
