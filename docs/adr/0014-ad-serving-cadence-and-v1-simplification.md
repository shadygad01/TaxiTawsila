# ADR-0014: Ad-Serving Call Cadence, Spatial Pre-Filtering, and Simplified V1 Targeting Arbitration

**Status:** Accepted

## Context

The Advertising Engine design (PRD, Domain Model §6) specifies enterprise-grade targeting (geofencing, route/radius, priority, budget pacing). Two gaps were found: (1) nothing specified *when* the client calls `GET /ads/serve` — if called on every live-tracking GPS ping (every 3–5s), ad targeting becomes one of the highest-frequency code paths in the system for no product reason; (2) building full priority-weighted, budget-paced arbitration logic before there is more than a handful of pilot merchants is speculative complexity solving a contention problem that doesn't exist yet.

## Decision

- **Call cadence:** `GET /ads/serve` is evaluated at trip-lifecycle moments only — trip start, periodic intervals (~60–90 seconds or a minimum displacement threshold, whichever the client implements), and trip completion — never on every raw GPS ping.
- **Spatial pre-filtering:** candidate campaigns for a given position are narrowed via a coarse spatial bucket (geohash or a per-city grid, recomputed on campaign create/update) before running precise PostGIS containment checks on the much smaller candidate set.
- **V1 targeting arbitration:** MVP serves the single best-matching active campaign for the current context, ties broken by creation order (oldest first). Full priority-weighted ranking and budget-pacing algorithms are deferred until real merchant campaigns actually compete for overlapping targeting — tracked as a named future enhancement (Improvement Report C2), not abandoned.

## Consequences

- **Positive:** avoids the ad-serve path becoming an unplanned hot path at scale; avoids building and testing arbitration logic with no real campaigns to validate it against; the deferred full arbitration engine remains a pure addition later (new ranking logic behind the same `GET /ads/serve` contract) rather than a redesign.
- **Negative:** MVP cannot express "merchant A pays for priority placement over merchant B in the same geofence" — acceptable, since MVP's pilot-merchant scale makes this scenario rare to nonexistent, and the feature is explicitly deferred rather than silently dropped.
