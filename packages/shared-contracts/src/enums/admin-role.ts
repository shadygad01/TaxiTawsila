/**
 * Admin RBAC roles (Security Model §3). Extensible — `admin.admin_user.role` has
 * no DB-level CHECK constraint by design (Database Schema §11), so new roles are
 * a data change, not a migration; this union is the compile-time source of truth
 * consumed by the RBAC guard (apps/backend/src/security/rbac).
 */
export enum AdminRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  OPS_ANALYST = 'OPS_ANALYST',
  TRUST_REVIEWER = 'TRUST_REVIEWER',
  DATA_QUALITY_REVIEWER = 'DATA_QUALITY_REVIEWER',
  FEATURE_MANAGER = 'FEATURE_MANAGER',
  REWARDS_MANAGER = 'REWARDS_MANAGER',
  CAMPAIGN_MANAGER = 'CAMPAIGN_MANAGER',
  SUPPORT_AGENT = 'SUPPORT_AGENT',
}
