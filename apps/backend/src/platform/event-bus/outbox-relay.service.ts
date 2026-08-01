import { Injectable, Logger } from '@nestjs/common';
import { IsNull, Repository } from 'typeorm';
import { Counter } from 'prom-client';
import { OutboxEntryEntity } from './entities/outbox-entry.entity';
import { OutboxDeadLetterEntity } from './entities/outbox-dead-letter.entity';
import { EventConsumptionLogEntity } from './entities/event-consumption-log.entity';
import { EventConsumer } from './event-consumer';

const deadLetterCounter = new Counter({
  name: 'outbox_dead_letter_total',
  help: 'Events moved to platform.outbox_dead_letter — each one should page an operator (Pre-Implementation Audit §7).',
  labelNames: ['event_type'],
});

/**
 * Drains platform.outbox: for each undispatched row, runs every consumer that
 * declares it handles that event type, skipping any (consumer, row) pair
 * already recorded in event_consumption_log (ADR-0023's corrected idempotency
 * — never (eventType, aggregateId)). A row is marked dispatched only once
 * every applicable consumer has either succeeded or been given up on via
 * dead-lettering (ADR-0024) — a row with one slow/failing consumer among
 * several never blocks the others from having already succeeded exactly once.
 *
 * MVP: a single polling worker (in-process, e.g. driven by a NestJS
 * `@Interval`/cron caller — not wired here, since Phase 2 has no real events
 * to dispatch yet). The per-aggregate-hash-partitioned claiming scheme
 * (ADR-0023) for multiple concurrent relay workers is a Phase 3+ concern,
 * introduced when there's real throughput to justify more than one worker.
 */
@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);

  constructor(
    private readonly outboxRepo: Repository<OutboxEntryEntity>,
    private readonly consumptionLogRepo: Repository<EventConsumptionLogEntity>,
    private readonly deadLetterRepo: Repository<OutboxDeadLetterEntity>,
    private readonly consumers: EventConsumer[],
    private readonly maxAttempts: number = 5,
  ) {}

  async pollAndDispatch(batchSize = 50): Promise<{ processed: number; deadLettered: number }> {
    const rows = await this.outboxRepo.find({
      where: { dispatchedAt: IsNull() },
      order: { createdAt: 'ASC' },
      take: batchSize,
    });

    let deadLettered = 0;
    for (const row of rows) {
      const wentToDeadLetter = await this.processRow(row);
      if (wentToDeadLetter) deadLettered += 1;
    }
    return { processed: rows.length, deadLettered };
  }

  /** Returns true if this row was dead-lettered during this call. */
  private async processRow(row: OutboxEntryEntity): Promise<boolean> {
    const applicableConsumers = this.consumers.filter((c) => c.handles(row.eventType));
    let anyFailed = false;
    let lastError: string | null = null;

    for (const consumer of applicableConsumers) {
      const alreadyProcessed = await this.consumptionLogRepo.findOneBy({
        consumerName: consumer.name,
        outboxEventId: row.id,
      });
      if (alreadyProcessed) continue;

      try {
        await consumer.handle(row);
        await this.consumptionLogRepo.insert({ consumerName: consumer.name, outboxEventId: row.id });
      } catch (error) {
        anyFailed = true;
        lastError = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Consumer "${consumer.name}" failed on outbox event ${row.id} (${row.eventType}), attempt ${row.attempts + 1}`,
          error as Error,
        );
      }
    }

    if (!anyFailed) {
      row.dispatchedAt = new Date();
      await this.outboxRepo.save(row);
      return false;
    }

    row.attempts += 1;
    if (row.attempts >= this.maxAttempts) {
      await this.moveToDeadLetter(row, lastError);
      return true;
    }

    await this.outboxRepo.save(row);
    return false;
  }

  private async moveToDeadLetter(row: OutboxEntryEntity, lastError: string | null): Promise<void> {
    const deadLetterEntry = this.deadLetterRepo.create({
      originalOutboxId: row.id,
      eventType: row.eventType,
      eventVersion: row.eventVersion,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      correlationId: row.correlationId,
      payload: row.payload,
      totalAttempts: row.attempts,
      lastError,
    });
    // .save() rather than .insert(): TypeORM's QueryDeepPartialEntity mapped
    // type (used by .insert()'s overloads) doesn't accept a concrete
    // Record<string, unknown> value for a jsonb column; .save()'s DeepPartial
    // typing does. Same entity, same single INSERT either way (no existing
    // primary key on a freshly-created entity).
    await this.deadLetterRepo.save(deadLetterEntry);
    deadLetterCounter.inc({ event_type: row.eventType });
    this.logger.error(
      `Event ${row.id} (${row.eventType}) exceeded ${this.maxAttempts} attempts — moved to dead letter. Requires operator attention.`,
    );

    // Removed from the active undispatched queue; the row itself is retained
    // (append-only, Coding Standards) with its history intact in outbox_dead_letter.
    row.dispatchedAt = new Date();
    await this.outboxRepo.save(row);
  }
}
