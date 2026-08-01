import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * platform.provenance_log (ADR-0022). Not consumed by any Phase 2
 * infrastructure — this entity exists so the table is migrated and ready for
 * the first module (Trip, Trust, Data Quality, Reward — all Phase 3+) that
 * writes a provenance-bearing value.
 */
@Entity({ name: 'provenance_log', schema: 'platform' })
@Index('idx_provenance_entity', ['entityType', 'entityId'])
export class ProvenanceLogEntryEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id!: string;

  @Column({ name: 'entity_type', type: 'text' })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId!: string;

  @Column({ name: 'value', type: 'jsonb' })
  value!: Record<string, unknown>;

  @Column({ name: 'source', type: 'text' })
  source!: string;

  @Column({ name: 'source_version', type: 'text' })
  sourceVersion!: string;

  @Column({ name: 'recorded_at', type: 'timestamptz', default: () => 'now()' })
  recordedAt!: Date;
}
