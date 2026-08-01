import { VersionedConfigStatus } from '@taxitawsila/shared-contracts';

/**
 * The shape every versioned configuration aggregate shares (ADR-0017,
 * extended by ADR-0026 for high-risk aggregates). Concrete config entities
 * (TrustThresholdConfig, FraudThresholdConfig, GpsThresholdConfig,
 * DataQualityThresholdConfig, RewardRuleConfig, AdvertisingTargetConfig,
 * RateLimitConfig, FarePolicyVersion) all extend this shape with their own
 * business-rule fields — none of those concrete entities exist yet in Phase 2
 * (they belong to Trust/Fraud/Fare/Reward/Advertising/Data-Quality contexts,
 * out of scope here); this is the framework they will plug into.
 */
export interface VersionedConfigRecord {
  id: string;
  cityId: string;
  status: VersionedConfigStatus;
  effectiveFrom: Date;
  createdAt: Date;
  rolledBackFrom: string | null;
  createdByAdminId: string | null;
  approvedByAdminId: string | null;
}

export type NewVersionInput<T extends VersionedConfigRecord> = Omit<
  T,
  'id' | 'status' | 'createdAt' | 'rolledBackFrom' | 'approvedByAdminId'
>;
