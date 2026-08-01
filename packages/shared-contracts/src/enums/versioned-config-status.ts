/**
 * Versioned configuration status (ADR-0017, extended by ADR-0026 for high-risk
 * aggregates). `PENDING_APPROVAL` only applies to aggregates designated
 * high-risk (Security Model §3) — ordinary config skips straight from DRAFT to
 * ACTIVE.
 */
export enum VersionedConfigStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  ACTIVE = 'ACTIVE',
  SUPERSEDED = 'SUPERSEDED',
}
