import { OutboxEntryEntity } from './entities/outbox-entry.entity';

/**
 * A registered consumer of outbox events (ADR-0023). `name` is the durable
 * identity used as half of the idempotency key in
 * `platform.event_consumption_log` — it must never change once a consumer has
 * processed events in production (renaming it would make the relay treat
 * every already-processed event as unprocessed again for the "new" name).
 */
export interface EventConsumer {
  readonly name: string;
  /** Which event types this consumer wants to handle; others are skipped without a log entry. */
  handles(eventType: string): boolean;
  /** Throws to signal failure — the relay handles retry/dead-letter bookkeeping. */
  handle(entry: OutboxEntryEntity): Promise<void>;
}
