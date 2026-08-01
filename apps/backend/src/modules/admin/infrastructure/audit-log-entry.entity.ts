import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * admin.audit_log_entry (Database Schema §11). Immutable, append-only —
 * enforced at the DB-role level in production (Design Notes §12), not just by
 * convention here. Every RBAC-gated / versioned-config action writes a row.
 */
@Entity({ name: 'audit_log_entry', schema: 'admin' })
@Index('idx_audit_entity', ['entityType', 'entityId'])
@Index('idx_audit_admin_user', ['adminUserId', 'createdAt'])
export class AuditLogEntryEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id!: string;

  @Column({ name: 'admin_user_id', type: 'uuid' })
  adminUserId!: string;

  @Column({ type: 'text' })
  action!: string;

  @Column({ name: 'entity_type', type: 'text' })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'text' })
  entityId!: string;

  @Column({ type: 'jsonb', nullable: true })
  before!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  after!: Record<string, unknown> | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
