# ADR-0019: Data Quality Platform as a Structurally Independent Context, Not a Trust Engine Extension

**Status:** Accepted

## Context

The Trust Engine (ADR-0008) answers "should this trip's rider be paid a reward" — a fraud/legitimacy question. The business also needs an answer to a different question: "should this trip's recorded data be used in ML training/analytics" — a data-fidelity question. A legitimate, non-fraudulent trip can still be poor training data (weak GPS, missing fields); making Trust Engine own both questions would overload its responsibility and conflate two independently-evolving concerns (fraud-signal tuning vs. data-science-quality tuning).

## Decision

Data Quality is a new bounded context (schema `dataquality`), structurally independent of Trust in the same sense ADR-0008 made Trust independent of Trip: it never mutates `Trip` or `TripTrustAssessment` directly, it reacts to `TripCompleted` via the transactional outbox (ADR-0011) to compute its own component scores (GPS, Route, Fare, User Input, Device Signals) and overall score, and it separately consumes `TripVerified`/`TripRejected` from Trust as one input (not the determining factor) into its own `readiness_status` (`READY_FOR_AI`/`LOW_QUALITY`/`MISSING_DATA`/`SUSPICIOUS`/`UNDER_REVIEW`). Both contexts may share a small stateless metrics-computation library (route deviation, speed profile) to avoid duplicating raw computation, but own their scoring/thresholding logic independently and version it independently (`engine_version` + config version on each context's own assessment table).

**Structural enforcement:** a database view, `dataquality.ml_ready_trip_dataset`, hard-filters to `readiness_status = 'READY_FOR_AI'` and is the only sanctioned read path for any future ML export/training job — mirroring how ADR-0008 made it structurally impossible for Reward to grant points without a Trust pass.

## Consequences

- **Positive:** fraud-signal tuning and data-quality-signal tuning can evolve on independent schedules without cross-impact; a trip can be simultaneously Trust-verified (reward paid) and Data-Quality-`UNDER_REVIEW` (not yet trusted for ML) without that being treated as a bug — it's a legitimate, expected state combination; the ML-readiness gate is enforced by the database, not by pipeline-author discipline.
- **Negative:** two independent consumers of `TripCompleted` means two independent background workers/relay consumers to operate (acceptable — the outbox pattern was designed for exactly this fan-out); some raw-metric computation logic is shared infrastructure, requiring discipline to keep it free of either context's business rules (kept in a dedicated stateless package, not owned by either module).
- **Relocation note:** `trip_feature_snapshot` (added under the `trust` schema per Architecture Review Improvement Item B5, before Data Quality existed as a context) moves to `dataquality.trip_feature_snapshot`, its correct long-term owner — see Database Schema update.
