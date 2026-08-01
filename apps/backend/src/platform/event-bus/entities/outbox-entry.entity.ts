import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * platform.outbox (ADR-0011, revised by ADR-0023). Every module writes a row
 * here in the same DB transaction as the state change that produced it — this
 * entity is the persistence mapping only; `OutboxPublisherService` is what
 * enforces the same-transaction discipline by requiring callers to pass their
 * own EntityManager.
 */
@Entity({ name: 'outbox', schema: 'platform' })
@Index('idx_outbox_undispatched', ['createdAt'], { where: 'dispatched_at IS NULL' })
@Index('idx_outbox_aggregate', ['aggregateId', 'createdAt'])
@Index('idx_outbox_correlation', ['correlationId'])
export class OutboxEntryEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id!: string;

  @Column({ name: 'event_type', type: 'text' })
  eventType!: string;

  @Column({ name: 'event_version', type: 'int', default: 1 })
  eventVersion!: number;

  @Column({ name: 'aggregate_type', type: 'text' })
  aggregateType!: string;

  @Column({ name: 'aggregate_id', type: 'uuid' })
  aggregateId!: string;

  @Column({ name: 'correlation_id', type: 'uuid' })
  correlationId!: string;

  @Column({ name: 'payload', type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'dispatched_at', type: 'timestamptz', nullable: true })
  dispatchedAt!: Date | null;

  @Column({ name: 'attempts', type: 'int', default: 0 })
  attempts!: number;
}
