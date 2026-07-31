# Architecture Improvement Report

**Status:** v1.0 — derived from `16-architecture-review.md`. This is the action list; the review document is the reasoning behind it.

## How to read this

Each item states: what changes, why (one line, full reasoning in the Review Report), which documents it touches, and when it must land relative to Phase 2. Items are grouped by urgency, not by subsystem.

---

## Group A — Must be decided before Phase 2 scaffolding (changes the shape of code that would otherwise need rework)

### A1. Adopt Transactional Outbox for all domain events
- **Change:** every module that publishes a domain event (`TripCompleted`, `TripVerified`, `PointsEarned`, etc.) writes it to an `outbox` table in the same DB transaction as the state change. A relay worker (simple poller at MVP) drains the outbox and dispatches to in-process handlers today, a real broker later — without changing the write-side contract or consumer interface.
- **Why:** an in-process `EventEmitter` silently drops events on crash/redeploy, which breaks the one guarantee the Trust/Reward split depends on. See Review §3.
- **Touches:** `02-architecture.md` (§9 Event Bus), `05-database-schema.md` (new `outbox` table, likely per-schema or a shared `platform.outbox`), new **ADR-0011**.
- **Timing:** design now, implement in Phase 3 alongside the Core Platform's event infrastructure — before Trip/Trust modules (Phases 5–6) are built on top of it.

### A2. Fix reward wallet concurrency
- **Change:** `points_balance` is not a separately-updated column; balance is computed as `SUM(ledger entries)` inside the same transaction that inserts a new ledger entry, with a `CHECK`/application-level guard that a `REDEEM` cannot drive the balance negative.
- **Why:** current design allows a double-redemption race with no locking; likely to surface from client retries, not just heavy load. See Review §5.
- **Touches:** `05-database-schema.md` (§6 reward schema), new **ADR-0016**.
- **Timing:** before Phase 7 (Rewards Platform) implementation begins.

### A3. Redesign `gps_ping` indexing and partitioning
- **Change:** drop the per-row GiST spatial index on `gps_ping.location` (no query needs spatial containment on individual pings); make `(trip_id, recorded_at)` the primary access-path index; partition the table by month on `recorded_at` from the first migration, not retrofitted later. Add a server-stamped `received_at` column alongside client-supplied `recorded_at`.
- **Why:** this is the highest-volume table in the system at every scale band; the wrong index costs write throughput for a query pattern that never uses it, and un-partitioned tables are expensive to partition retroactively once populated. See Review §2, §15, §20.
- **Touches:** `05-database-schema.md` (§4 trip schema), `14-scalability-plan.md` (§3), new **ADR-0015**.
- **Timing:** before Phase 5 (Trip Platform / GPS Engine) writes its first migration.

### A4. Distributed rate limiting and config-cache invalidation
- **Change:** rate limiting (OTP, trip creation, GPS ingestion, ad-serve) must be backed by Redis (shared counters), not per-instance memory. Config caches (`FareRuleSet`/`TrustThresholdConfig`/`RewardRuleConfig` "current effective version") use a short TTL (10–30s) by default, with pub/sub invalidation specifically for `TrustThresholdConfig` given its incident-response sensitivity.
- **Why:** both are silent single-instance assumptions that break correctness (not just performance) the moment a second backend instance exists — likely the first horizontal-scaling step, well before 10,000 MAU. See Review §18, §20, §21–22.
- **Touches:** `02-architecture.md` (§9), `09-security-model.md` (§5), new **ADR-0013**.
- **Timing:** decide now, implement in Phase 3 (Core Platform) so it's never built the wrong way to begin with.

### A5. Add `cityId`/region parameter to Maps/Routing/Geocoding provider signatures
- **Change:** `MapProvider`/`RoutingProvider`/`GeocodingProvider` port methods accept an explicit `cityId` (or region bounds) parameter from the start. MVP adapter ignores it and always targets the single Alexandria instance; multi-city expansion routes to the correct regional instance without a signature change.
- **Why:** cheap now, expensive to retrofit across every call site later. See Review §8–10, §24.
- **Touches:** `02-architecture.md` (§4 Provider Abstraction table), `packages/shared-contracts` Port definitions (Phase 2 scaffolding).
- **Timing:** before Phase 4 (Maps Platform) defines the actual interfaces.

---

## Group B — Should be decided before the relevant phase, not urgent for Phase 2 itself

### B1. Correct the Trip module's internal structure vs. the C4 diagram
- **Change:** clarify that `GPSMod`/`FareMod`/`HistMod` are internal service classes within the single Trip module (matching the one-`Trip`-aggregate Domain Model), not sibling Nest modules with independent public interfaces.
- **Why:** doc drift between `02-architecture.md` and `03-domain-model.md` risks Phase 2 scaffolding the wrong module boundaries. See Review §1.
- **Touches:** `02-architecture.md` (§3 C4 diagram, relabel).
- **Timing:** before Phase 2 backend scaffolding names its Nest modules.

### B2. Close the fare-estimation "traffic" scope gap
- **Change:** rename the PRD's "traffic" fare-input to reflect what's actually built (time-of-day multipliers in `FareRuleSet`); explicitly mark live-traffic-responsive estimation as a named post-MVP enhancement requiring a future `TrafficProvider` port, not a Phase 5 deliverable.
- **Why:** avoids Phase 5 either under-delivering silently against the PRD or improvising an unreviewed traffic integration. See Review §7.
- **Touches:** `01-prd.md` (§7.1), `02-architecture.md` (§4 Provider Abstraction table — add `TrafficProvider` row marked "post-MVP"), new **ADR-0012**.
- **Timing:** before Phase 5 (Trip Platform / Fare Engine).

### B3. Simplify Advertising Engine v1 targeting arbitration
- **Change:** MVP ships "best single matching active campaign, ties broken by creation order" instead of full priority-weighted, budget-paced arbitration; build the full arbitration engine only once real merchant volume creates actual competition for the same geofence. Also fix call cadence: ad-serve evaluated at trip-lifecycle moments (start, ~60–90s intervals or displacement threshold, completion) — never per raw GPS ping — with a coarse spatial pre-filter (geohash/grid bucket) ahead of precise PostGIS containment.
- **Why:** the full arbitration engine is speculative complexity against a handful of pilot merchants; the call-cadence fix prevents the ad-serve path from becoming one of the hottest endpoints in the system for no product reason. See Review §6.
- **Touches:** `03-domain-model.md` (§6 Advertising Context, note v1 simplification), `06-api-specification.md` (§5, document call cadence contract), new **ADR-0014**.
- **Timing:** before Phase 8 (Advertising Platform) design/implementation.

### B4. State the accepted guest-identity fraud risk and the registration merge-conflict rule explicitly
- **Change:** (a) document that reinstall-based guest reward farming is a known, accepted MVP risk, mitigated initially by capping early reward value and monitoring abuse rate, with hardware attestation (Play Integrity/App Attest) as a named Phase 6+ hardening item if abuse data justifies it; (b) codify the rule that guest-history merge on registration only occurs when the device's local rider is still `GUEST` at that moment — if the OTP/Google/Apple identity already belongs to an existing `REGISTERED` rider, no merge happens, the device just logs into the existing account.
- **Why:** both are real fraud vectors specific to this platform's guest-first design that were previously implicit rather than decided. See Review §12–14, §21–22.
- **Touches:** `09-security-model.md` (§4, §6), `10-threat-model.md` (§2 Spoofing table, new row), ADR-0009 (amend).
- **Timing:** before Phase 3 (Identity & Auth) implements the promotion use case.

### B5. Add `trust.trip_feature_snapshot` for ML readiness
- **Change:** persist the per-trip feature vector the Trust Engine already computes (distance, duration, avg/max speed, stop count, route-deviation stats, time-of-day, day-of-week) as a first-class row alongside `TripTrustAssessment`, rather than requiring future recomputation from raw pings.
- **Why:** raw-ping retention windows (Security Model §4) mean this data can't be reconstructed retroactively with full fidelity once pruned — earlier capture means more usable training history later. See Review §23.
- **Touches:** `05-database-schema.md` (§5 trust schema), `03-domain-model.md` (§4 Trust Context).
- **Timing:** before Phase 6 (Trust Platform) implementation.

### B6. Harden GPS ingestion contract
- **Change:** enforce a per-request batch-size cap on buffered-ping flush; add a client-generated ping ID enabling `INSERT ... ON CONFLICT DO NOTHING` idempotency; add server-stamped `received_at` (bundled with A3) and treat large `recorded_at`-vs-`received_at` divergence as a trust-signal input.
- **Why:** offline buffering + client-controlled timestamps are both real correctness/fraud surfaces that were implied but not contractually specified. See Review §15–17.
- **Touches:** `06-api-specification.md` (§3 Trip Module, `/trips/{tripId}/gps`), `05-database-schema.md` (§4).
- **Timing:** before Phase 5 GPS Engine implementation.

### B7. Reverse implied hosted-first sequencing for Routing/Geocoding
- **Change:** MVP targets a single small self-hosted OSRM+Nominatim VM (Alexandria-only OSM extract) from the start, not an interim hosted instance later migrated to self-hosted. Update Deployment Strategy's migration-trigger framing to reflect that the self-hosted starting point is already the cost-optimal choice at this footprint.
- **Why:** a single-city self-hosted footprint is cheap enough that skipping the "hosted, migrate later" interim step avoids a needless migration project. See Review §8–10.
- **Touches:** `12-deployment-strategy.md` (§5), `02-architecture.md` (§8 Cost Strategy).
- **Timing:** before Phase 4 (Maps Platform) provisions any infrastructure.

---

## Group C — Explicitly deferred (correctly out of scope for now; recorded so they aren't re-litigated)

- **C1. Percentage-rollout / cohort-targeted feature flags** — flat boolean flags remain adequate through the 10,000 MAU / single-city band. Revisit at multi-city or when gradual Trust-signal rollout is needed. (Review §19)
- **C2. Full ad-serving priority/budget-pacing arbitration** — build only once real merchant competition for the same geofence exists (see B3 for the interim simplification, this item is the eventual full build). (Review §6)
- **C3. Splitting Trust Engine into its own deployable service** — remains correctly deferred until scoring workload (not user count) is CPU-bound; the structural boundary (ADR-0008) already makes this a later infrastructure change, not a redesign. (Review §4)
- **C4. City-based database sharding** — correctly deferred until the 100,000–1,000,000 band or genuine multi-city concurrent load; `city_id` scoping already makes this additive when the time comes. (Review §2, §24)
- **C5. WhatsApp-based OTP delivery as a cost optimization** — additive `AuthenticationProvider` adapter, worth revisiting at high SMS-cost scale, not before. (Review §11)

---

## Priority Summary

| Priority | Items | Gate |
|---|---|---|
| **P0 — before Phase 2 scaffolding names anything** | B1 (module/diagram correction) | Prevents scaffolding the wrong module boundaries |
| **P1 — before Phase 3 (Core Platform)** | A1 (outbox), A4 (distributed rate limit + cache invalidation), B4 (guest-fraud policy) | These are foundational cross-cutting mechanisms every later phase builds on |
| **P2 — before Phase 4 (Maps Platform)** | A5 (region param), B7 (self-host-first sequencing) | Provider interfaces get harder to change once call sites exist |
| **P3 — before Phase 5 (Trip Platform)** | A3 (gps_ping redesign), B2 (traffic scope), B6 (GPS ingestion contract) | Trip/GPS schema and API contract are foundational to Trust/Rewards |
| **P4 — before Phase 6 (Trust Platform)** | B5 (feature snapshot table) | Needed so ML-ready data starts accumulating from first launch |
| **P5 — before Phase 7 (Rewards Platform)** | A2 (wallet concurrency) | Must be correct before real points/redemptions exist |
| **P6 — before Phase 8 (Advertising Platform)** | B3 (ad arbitration simplification + cadence) | Avoids building speculative complexity and a hot-path mistake simultaneously |

No item in Group A or B requires abandoning any Phase 1 document's core direction — every fix is a targeted revision within the existing modular-monolith / Ports-and-Adapters / bounded-context architecture, which is why Phase 2 can proceed once these are incorporated, rather than triggering a full re-architecture.
