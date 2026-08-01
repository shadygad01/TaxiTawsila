import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { DomainEventEnvelope } from '@taxitawsila/shared-contracts';
import { OutboxEntryEntity } from './entities/outbox-entry.entity';

/**
 * Publishes a domain event through the transactional outbox (ADR-0011).
 *
 * Callers MUST pass the same `EntityManager` they used for the state change
 * that produced this event — that is the entire mechanism that makes the
 * outbox transactional (the outbox insert and the state change either both
 * commit or both roll back together). There is no "fire and forget" publish
 * method by design; a caller with no transaction in hand is a caller doing
 * something wrong.
 */
@Injectable()
export class OutboxPublisherService {
  async publish<TPayload>(manager: EntityManager, event: DomainEventEnvelope<TPayload>): Promise<void> {
    const entry = manager.create(OutboxEntryEntity, {
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      correlationId: event.correlationId,
      payload: event.payload as Record<string, unknown>,
    });
    // .save() rather than .insert(): TypeORM's QueryDeepPartialEntity mapped
    // type (used by .insert()'s overloads) doesn't accept a concrete
    // Record<string, unknown> value for a jsonb column; .save()'s DeepPartial
    // typing does. Same single INSERT either way (entry has no primary key yet).
    await manager.save(OutboxEntryEntity, entry);
  }
}
