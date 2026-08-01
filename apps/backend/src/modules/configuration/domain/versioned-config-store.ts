import { VersionedConfigStatus } from '@taxitawsila/shared-contracts';
import { VersionedConfigRecord } from './versioned-config-record';

/**
 * Storage port for `VersionedConfigService` (domain-layer interface, zero
 * framework/TypeORM imports — Coding Standards §2). A concrete module (Phase
 * 3+) implements this against its own TypeORM repository for its own entity;
 * `VersionedConfigService`'s state-machine logic is exercised in unit tests
 * against a trivial in-memory implementation, with no database required.
 */
export interface VersionedConfigStore<T extends VersionedConfigRecord> {
  findById(id: string): Promise<T | null>;
  findByCityAndStatus(cityId: string, status: VersionedConfigStatus): Promise<T[]>;
  insert(record: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
}
