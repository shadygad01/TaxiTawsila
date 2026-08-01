import { randomUUID } from 'node:crypto';
import { VersionedConfigStatus } from '@taxitawsila/shared-contracts';
import { VersionedConfigService } from '../../../../src/modules/configuration/domain/versioned-config.service';
import { VersionedConfigStore } from '../../../../src/modules/configuration/domain/versioned-config-store';
import { VersionedConfigRecord, NewVersionInput } from '../../../../src/modules/configuration/domain/versioned-config-record';

// A trivial fixture entity used ONLY in this test suite — proving the generic
// framework works with zero coupling to any real (and, in Phase 2, nonexistent)
// business config aggregate. Real aggregates (TrustThresholdConfig, etc.) get
// their own thin wrapper + their own tests when their owning module is built.
interface FixtureConfig extends VersionedConfigRecord {
  someValue: number;
}

class InMemoryStore implements VersionedConfigStore<FixtureConfig> {
  private rows = new Map<string, FixtureConfig>();

  async findById(id: string): Promise<FixtureConfig | null> {
    return this.rows.get(id) ?? null;
  }

  async findByCityAndStatus(cityId: string, status: VersionedConfigStatus): Promise<FixtureConfig[]> {
    return [...this.rows.values()].filter((r) => r.cityId === cityId && r.status === status);
  }

  async insert(record: FixtureConfig): Promise<FixtureConfig> {
    this.rows.set(record.id, record);
    return record;
  }

  async update(id: string, patch: Partial<FixtureConfig>): Promise<FixtureConfig> {
    const existing = this.rows.get(id);
    if (!existing) throw new Error('not found');
    const updated = { ...existing, ...patch };
    this.rows.set(id, updated);
    return updated;
  }
}

function buildRecord(input: NewVersionInput<FixtureConfig>, status: VersionedConfigStatus, rolledBackFrom: string | null = null): FixtureConfig {
  return {
    id: randomUUID(),
    status,
    createdAt: new Date(),
    rolledBackFrom,
    approvedByAdminId: null,
    ...input,
  };
}

const CITY = 'city-1';
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

describe('VersionedConfigService (generic ADR-0017/ADR-0026 framework)', () => {
  describe('ordinary (non-high-risk) aggregate', () => {
    it('publishes straight to ACTIVE and resolves it as current', async () => {
      const store = new InMemoryStore();
      const service = new VersionedConfigService(store, false);

      const published = await service.publish(
        { cityId: CITY, effectiveFrom: daysAgo(1), createdByAdminId: 'admin-1', someValue: 42 },
        buildRecord,
      );

      expect(published.status).toBe(VersionedConfigStatus.ACTIVE);
      const resolved = await service.resolveActive(CITY);
      expect(resolved?.id).toBe(published.id);
      expect(resolved?.someValue).toBe(42);
    });

    it('supersedes the previous ACTIVE version once a new one with an earlier-or-equal effectiveFrom is published', async () => {
      const store = new InMemoryStore();
      const service = new VersionedConfigService(store, false);

      const v1 = await service.publish({ cityId: CITY, effectiveFrom: daysAgo(10), createdByAdminId: 'admin-1', someValue: 1 }, buildRecord);
      const v2 = await service.publish({ cityId: CITY, effectiveFrom: daysAgo(1), createdByAdminId: 'admin-1', someValue: 2 }, buildRecord);

      const v1Reloaded = await store.findById(v1.id);
      expect(v1Reloaded?.status).toBe(VersionedConfigStatus.SUPERSEDED);

      const resolved = await service.resolveActive(CITY);
      expect(resolved?.id).toBe(v2.id);
    });

    it('does not resolve a version whose effectiveFrom is in the future', async () => {
      const store = new InMemoryStore();
      const service = new VersionedConfigService(store, false);
      const future = new Date(Date.now() + 86_400_000);

      await service.publish({ cityId: CITY, effectiveFrom: future, createdByAdminId: 'admin-1', someValue: 99 }, buildRecord);

      const resolved = await service.resolveActive(CITY, new Date());
      expect(resolved).toBeNull();
    });

    it('tie-breaks two versions with an identical effectiveFrom by createdAt (Pre-Implementation Audit §6)', async () => {
      const store = new InMemoryStore();
      const service = new VersionedConfigService(store, false);
      const sameEffectiveFrom = daysAgo(1);

      await service.publish({ cityId: CITY, effectiveFrom: sameEffectiveFrom, createdByAdminId: 'admin-1', someValue: 1 }, buildRecord);
      // Second publish supersedes the first (same effectiveFrom => "earlier-or-equal").
      const second = await service.publish({ cityId: CITY, effectiveFrom: sameEffectiveFrom, createdByAdminId: 'admin-1', someValue: 2 }, buildRecord);

      const resolved = await service.resolveActive(CITY);
      expect(resolved?.id).toBe(second.id);
    });

    it('rollback publishes a new version copying the target, never mutating history', async () => {
      const store = new InMemoryStore();
      const service = new VersionedConfigService(store, false);

      const original = await service.publish({ cityId: CITY, effectiveFrom: daysAgo(5), createdByAdminId: 'admin-1', someValue: 10 }, buildRecord);
      await service.publish({ cityId: CITY, effectiveFrom: daysAgo(1), createdByAdminId: 'admin-1', someValue: 999 }, buildRecord);

      const rolledBack = await service.rollback(
        original.id,
        'admin-2',
        (target) => ({ cityId: target.cityId, effectiveFrom: new Date(), createdByAdminId: target.createdByAdminId, someValue: target.someValue }),
        (input, status, rolledBackFrom) => buildRecord(input, status, rolledBackFrom),
      );

      expect(rolledBack.someValue).toBe(10);
      expect(rolledBack.rolledBackFrom).toBe(original.id);
      expect(rolledBack.status).toBe(VersionedConfigStatus.ACTIVE);

      // Original row is untouched — rollback never rewrites history.
      const originalReloaded = await store.findById(original.id);
      expect(originalReloaded?.someValue).toBe(10);
    });
  });

  describe('high-risk aggregate (dual control, ADR-0026)', () => {
    it('publishes to PENDING_APPROVAL, not ACTIVE, and is not yet resolvable', async () => {
      const store = new InMemoryStore();
      const service = new VersionedConfigService(store, true);

      const published = await service.publish(
        { cityId: CITY, effectiveFrom: daysAgo(1), createdByAdminId: 'admin-1', someValue: 5 },
        buildRecord,
      );

      expect(published.status).toBe(VersionedConfigStatus.PENDING_APPROVAL);
      expect(await service.resolveActive(CITY)).toBeNull();
    });

    it('activates and becomes resolvable once approved by a different admin', async () => {
      const store = new InMemoryStore();
      const service = new VersionedConfigService(store, true);
      const published = await service.publish({ cityId: CITY, effectiveFrom: daysAgo(1), createdByAdminId: 'admin-1', someValue: 5 }, buildRecord);

      const approved = await service.approve(published.id, 'admin-2');

      expect(approved.status).toBe(VersionedConfigStatus.ACTIVE);
      expect(approved.approvedByAdminId).toBe('admin-2');
      const resolved = await service.resolveActive(CITY);
      expect(resolved?.id).toBe(published.id);
    });

    it('rejects self-approval by the same admin who proposed it (the core ADR-0026 guarantee)', async () => {
      const store = new InMemoryStore();
      const service = new VersionedConfigService(store, true);
      const published = await service.publish({ cityId: CITY, effectiveFrom: daysAgo(1), createdByAdminId: 'admin-1', someValue: 5 }, buildRecord);

      await expect(service.approve(published.id, 'admin-1')).rejects.toThrow(/dual-control/i);
    });

    it('rejects approving a version that is not PENDING_APPROVAL', async () => {
      const store = new InMemoryStore();
      const service = new VersionedConfigService(store, true);
      const published = await service.publish({ cityId: CITY, effectiveFrom: daysAgo(1), createdByAdminId: 'admin-1', someValue: 5 }, buildRecord);
      await service.approve(published.id, 'admin-2');

      await expect(service.approve(published.id, 'admin-3')).rejects.toThrow(/not PENDING_APPROVAL/);
    });
  });
});
