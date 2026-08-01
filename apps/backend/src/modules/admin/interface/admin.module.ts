import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUserEntity } from '../infrastructure/admin-user.entity';
import { AuditLogEntryEntity } from '../infrastructure/audit-log-entry.entity';
import { AuditLogService } from '../application/audit-log.service';

/**
 * Administration Context (Domain Model §11). Phase 2 scope: `AdminUserEntity`
 * (the row every RBAC role and every versioned-config `createdByAdminId`/
 * `approvedByAdminId` FK references) and `AuditLogService` (the shared,
 * single write path for audit-logging any admin action). The full admin
 * dashboard composition layer (reads/manages every other context) is a
 * Phase 9 deliverable, built once there's something to administer.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AdminUserEntity, AuditLogEntryEntity])],
  providers: [AuditLogService],
  exports: [AuditLogService, TypeOrmModule],
})
export class AdminModule {}
