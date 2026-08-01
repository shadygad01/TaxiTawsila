import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntryEntity } from '../infrastructure/audit-log-entry.entity';

export interface AuditableAction {
  adminUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/**
 * Every RBAC-gated admin action is audit-logged (Security Model §3, Database
 * Schema §11). A single, shared write path — modules call `record()` rather
 * than each reimplementing "insert an audit row," which is exactly the kind
 * of duplicated business logic the Phase 2 Definition of Done forbids.
 */
@Injectable()
export class AuditLogService {
  constructor(@InjectRepository(AuditLogEntryEntity) private readonly repo: Repository<AuditLogEntryEntity>) {}

  async record(entry: AuditableAction): Promise<AuditLogEntryEntity> {
    const row = this.repo.create({
      adminUserId: entry.adminUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
    return this.repo.save(row);
  }
}
