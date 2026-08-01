import { VersionedConfigStatus } from '@taxitawsila/shared-contracts';
import { VersionedConfigRecord, NewVersionInput } from './versioned-config-record';
import { VersionedConfigStore } from './versioned-config-store';

/**
 * Generic versioned-configuration state machine (ADR-0017, ADR-0026).
 * Framework-free (no NestJS/TypeORM import — Coding Standards §2): every
 * concrete config aggregate's application-layer service composes this rather
 * than reimplementing the same DRAFT/PENDING_APPROVAL/ACTIVE/SUPERSEDED
 * discipline, resolution tie-break, and dual-control rule per aggregate.
 */
export class VersionedConfigService<T extends VersionedConfigRecord> {
  constructor(
    private readonly store: VersionedConfigStore<T>,
    private readonly isHighRisk: boolean,
  ) {}

  /**
   * "Current effective version" (ADR-0017): the latest ACTIVE row whose
   * effectiveFrom has passed, tie-broken by createdAt (Pre-Implementation
   * Audit §6 — previously unspecified for near-simultaneous publishes).
   */
  async resolveActive(cityId: string, atDate: Date = new Date()): Promise<T | null> {
    const activeCandidates = await this.store.findByCityAndStatus(cityId, VersionedConfigStatus.ACTIVE);
    const eligible = activeCandidates.filter((c) => c.effectiveFrom.getTime() <= atDate.getTime());
    if (eligible.length === 0) return null;

    eligible.sort((a, b) => {
      const byEffectiveFrom = b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
      if (byEffectiveFrom !== 0) return byEffectiveFrom;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    return eligible[0] as T;
  }

  /**
   * Publishes a new version. High-risk aggregates land in PENDING_APPROVAL
   * and require `approve()` by a different admin before taking effect
   * (ADR-0026); ordinary aggregates go straight to ACTIVE.
   */
  async publish(input: NewVersionInput<T>, buildRecord: (input: NewVersionInput<T>, status: VersionedConfigStatus) => T): Promise<T> {
    const status = this.isHighRisk ? VersionedConfigStatus.PENDING_APPROVAL : VersionedConfigStatus.ACTIVE;
    const record = buildRecord(input, status);
    const inserted = await this.store.insert(record);
    if (status === VersionedConfigStatus.ACTIVE) {
      await this.supersedePreviousActiveVersions(inserted);
    }
    return inserted;
  }

  /**
   * Approves a PENDING_APPROVAL version (high-risk aggregates only, ADR-0026).
   * The approver must be a different admin than the one who proposed it —
   * enforced here, not left to caller discipline, since this is precisely the
   * control the ADR exists to guarantee.
   */
  async approve(versionId: string, approvingAdminId: string): Promise<T> {
    const version = await this.store.findById(versionId);
    if (!version) {
      throw new Error(`Version ${versionId} not found`);
    }
    if (version.status !== VersionedConfigStatus.PENDING_APPROVAL) {
      throw new Error(`Version ${versionId} is not PENDING_APPROVAL (currently ${version.status})`);
    }
    if (version.createdByAdminId && version.createdByAdminId === approvingAdminId) {
      throw new Error('Dual-control violation: the approving admin must differ from the proposing admin (ADR-0026)');
    }

    const activated = await this.store.update(versionId, {
      status: VersionedConfigStatus.ACTIVE,
      approvedByAdminId: approvingAdminId,
    } as Partial<T>);
    await this.supersedePreviousActiveVersions(activated);
    return activated;
  }

  /**
   * Rollback (ADR-0017): publishes a NEW version copying a prior version's
   * business-rule fields — never a destructive revert. `cloneFields` extracts
   * the concrete entity's own fields from the target (this generic service
   * has no knowledge of them); `buildRecord` assembles the new record exactly
   * as `publish()` does.
   */
  async rollback(
    targetVersionId: string,
    adminId: string,
    cloneFields: (target: T) => NewVersionInput<T>,
    buildRecord: (input: NewVersionInput<T>, status: VersionedConfigStatus, rolledBackFrom: string) => T,
  ): Promise<T> {
    const target = await this.store.findById(targetVersionId);
    if (!target) {
      throw new Error(`Version ${targetVersionId} not found`);
    }
    const status = this.isHighRisk ? VersionedConfigStatus.PENDING_APPROVAL : VersionedConfigStatus.ACTIVE;
    const clonedInput: NewVersionInput<T> = { ...cloneFields(target), createdByAdminId: adminId } as NewVersionInput<T>;
    const record = buildRecord(clonedInput, status, targetVersionId);
    const inserted = await this.store.insert(record);
    if (status === VersionedConfigStatus.ACTIVE) {
      await this.supersedePreviousActiveVersions(inserted);
    }
    return inserted;
  }

  private async supersedePreviousActiveVersions(newlyActive: T): Promise<void> {
    const currentlyActive = await this.store.findByCityAndStatus(newlyActive.cityId, VersionedConfigStatus.ACTIVE);
    for (const version of currentlyActive) {
      // Never supersede itself, and never supersede a version scheduled to
      // take effect later than the one just activated — that future version
      // still wins its own effectiveFrom moment.
      if (version.id === newlyActive.id) continue;
      if (version.effectiveFrom.getTime() > newlyActive.effectiveFrom.getTime()) continue;
      await this.store.update(version.id, { status: VersionedConfigStatus.SUPERSEDED } as Partial<T>);
    }
  }
}
