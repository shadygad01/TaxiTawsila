import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** platform.outbox_dead_letter (ADR-0024). */
@Entity({ name: 'outbox_dead_letter', schema: 'platform' })
@Index('idx_dead_letter_unresolved', ['failedAt'], { where: 'requeued_at IS NULL' })
export class OutboxDeadLetterEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id!: string;

  @Column({ name: 'original_outbox_id', type: 'bigint' })
  originalOutboxId!: string;

  @Column({ name: 'event_type', type: 'text' })
  eventType!: string;

  @Column({ name: 'event_version', type: 'int' })
  eventVersion!: number;

  @Column({ name: 'aggregate_type', type: 'text' })
  aggregateType!: string;

  @Column({ name: 'aggregate_id', type: 'uuid' })
  aggregateId!: string;

  @Column({ name: 'correlation_id', type: 'uuid' })
  correlationId!: string;

  @Column({ name: 'payload', type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'total_attempts', type: 'int' })
  totalAttempts!: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'failed_at', type: 'timestamptz', default: () => 'now()' })
  failedAt!: Date;

  @Column({ name: 'requeued_at', type: 'timestamptz', nullable: true })
  requeuedAt!: Date | null;

  @Column({ name: 'requeued_by_admin_id', type: 'uuid', nullable: true })
  requeuedByAdminId!: string | null;
}
