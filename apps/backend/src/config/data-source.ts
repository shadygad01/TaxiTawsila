import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { OutboxEntryEntity } from '../platform/event-bus/entities/outbox-entry.entity';
import { OutboxDeadLetterEntity } from '../platform/event-bus/entities/outbox-dead-letter.entity';
import { EventConsumptionLogEntity } from '../platform/event-bus/entities/event-consumption-log.entity';
import { ProvenanceLogEntryEntity } from '../platform/event-bus/entities/provenance-log-entry.entity';
import { AdminUserEntity } from '../modules/admin/infrastructure/admin-user.entity';
import { AuditLogEntryEntity } from '../modules/admin/infrastructure/audit-log-entry.entity';
import { CityEntity } from '../modules/configuration/infrastructure/city.entity';

/**
 * TypeORM DataSource for the migration CLI (Database Schema §12: TypeORM
 * chosen as the migration tool, decided in Phase 2). `synchronize` is never
 * true anywhere in this file — schema changes are always explicit, reviewed
 * migrations (Coding Standards, Deployment Strategy §3), never
 * auto-generated from entity changes at boot.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USER ?? 'postgres',
  password: process.env.DATABASE_PASSWORD ?? 'postgres',
  database: process.env.DATABASE_NAME ?? 'taxitawsila',
  synchronize: false,
  logging: process.env.NODE_ENV === 'local',
  entities: [
    OutboxEntryEntity,
    OutboxDeadLetterEntity,
    EventConsumptionLogEntity,
    ProvenanceLogEntryEntity,
    AdminUserEntity,
    AuditLogEntryEntity,
    CityEntity,
  ],
  migrations: ['migrations/*.ts'],
  migrationsTableName: 'typeorm_migrations',
});
