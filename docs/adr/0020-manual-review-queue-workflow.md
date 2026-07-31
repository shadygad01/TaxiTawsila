# ADR-0020: Manual Review Queue as a Mandatory Gate Before Dataset Readiness, Distinct From the Trust Review Queue

**Status:** Accepted

## Context

Trips landing in `SUSPICIOUS` or `UNDER_REVIEW` (Data Quality Context, ADR-0019) must never silently enter `READY_FOR_AI` — that would defeat the purpose of having a readiness gate at all. A review workflow is required. A separate queue already exists for Trust (`/admin/trust/flagged`, `FLAGGED_FOR_REVIEW` verdicts) — the two must not be merged, because they resolve different questions (reward eligibility vs. dataset inclusion) and can legitimately disagree (see ADR-0019).

## Decision

`dataquality.data_review_case` (created only when a trip's `readiness_status` lands on `SUSPICIOUS`/`UNDER_REVIEW`) follows the state machine `PENDING_REVIEW → {APPROVED, REJECTED, MERGED, CORRECTED, ESCALATED}`, with `ESCALATED` able to resolve to `APPROVED`/`REJECTED`/`CORRECTED`. Every transition is recorded in an append-only `data_review_case_event` table (admin actor, note, timestamp) — separate from, but following the same audit discipline as, `admin.audit_log_entry`. `readiness_status` only transitions to `READY_FOR_AI` as a *result* of `APPROVED` or `CORRECTED`; there is no automatic time-based promotion out of `SUSPICIOUS`/`UNDER_REVIEW`. A `CORRECTED` resolution that edits a stored trip field writes a `MANUAL_OVERRIDE` provenance entry (ADR-0022) for that field, preserving the fact that a human, not the original measurement, produced the corrected value.

## Consequences

- **Positive:** no unreviewed low-quality/suspicious data can enter the ML-ready dataset by any path, including passive inaction; reviewers get a dedicated, auditable workflow scoped to exactly the cases that need it (Trust's own queue stays focused on fraud/reward decisions); manual corrections are traceable to a specific admin and preserve the original measurement's provenance record rather than silently overwriting it.
- **Negative:** requires ongoing operational review capacity — a backlog of `PENDING_REVIEW`/`ESCALATED` cases is an operational risk (tracked in Risk Analysis) that scales with trip volume and quality-threshold strictness; the trade-off is accepted because the alternative (auto-promotion) directly undermines the platform's core "data quality is the asset" thesis.
