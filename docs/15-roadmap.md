# Roadmap

**Status:** v1.2 — extended with the Data Quality, Feature Management, Configuration, and Fare Policy platforms before Phase 2 begins (see `18-platform-extensions.md`).

This roadmap maps the 10 development phases defined in the project's master prompt to concrete milestones and exit criteria. Each phase gates the next: a phase is not "done" until its Quality Requirements (architecture review, tests, docs, security/performance review) are met — no phase is skipped for speed.

## Phase 1 — Research & Architecture *(this document set)*

**Deliverables:** PRD, System Architecture, Domain Model, ERD, Database Schema, API Specification, Folder Structure, Coding Standards, ADRs, Security Model, Threat Model, Risk Analysis, Deployment Strategy, Testing Strategy, Scalability Plan, Roadmap — **plus, added in this revision:** Architecture Review + Improvement Reports, Platform Extensions design (Data Quality, Feature Management, Configuration, Fare Policy Engine), and ADR-0011 through ADR-0022.

**Exit criteria:** all documents internally consistent, reviewed, and committed. No application code written.

## Phase 2 — Project Foundation

- Scaffold monorepo (`apps/`, `packages/`, `infra/`) per Folder Structure.
- Backend: NestJS skeleton with module stubs for every bounded context (empty domain/application/infrastructure/interface layers, wired but no business logic).
- Mobile: Flutter skeleton with Clean Architecture folder scaffolding.
- Admin Web: React skeleton with feature-folder scaffolding.
- Shared packages: `shared-contracts` with base enums/DTO scaffolding.
- CI/CD pipelines (lint, test, build) per Deployment Strategy §3.
- Formatting/linting configs (Coding Standards) enforced from the first commit.
- **Exit criteria:** empty apps build, lint, and deploy to staging successfully; CI green on a trivial PR.

## Phase 3 — Core Platform

- Identity & Auth module: guest session issuance, OTP/Google/Apple adapters, JWT issuance/refresh.
- **Configuration Platform** (expanded scope, ADR-0017): the full versioned-config aggregate inventory — trust thresholds (now with `flaggedReviewMinScore`), reward rules, GPS thresholds (now with `maxBatchSizePerRequest`), fraud thresholds, advertising targeting defaults (now with ad-serve cadence), rate limits, data-quality thresholds — one shared versioned/audited/rollback-capable repository pattern, admin CRUD for each. **High-risk aggregates get the `PENDING_APPROVAL` dual-control step from day one** (ADR-0026, Pre-Implementation Audit §5) — not retrofitted after a single-admin config incident.
- **Feature Management Platform** (ADR-0018): toggles, percentage rollouts, environment/city scoping, segments, kill switches (with `riskTier` dual control for `HIGH`, ADR-0026), experiments — built here, not deferred, since Phase 3 is also where the Redis-backed cache/pub-invalidation infrastructure it shares with Configuration is built.
- **Transactional Outbox infrastructure (ADR-0011, revised by ADR-0023/ADR-0024 on the Pre-Implementation Audit):** event envelope with `eventVersion`/`correlationId`, per-aggregate-ordered relay claiming, `event_consumption_log`-based idempotency, and dead-letter handling with alerting — built correctly here since every later reactive module (Trust, Data Quality, Reward) depends on it, and retrofitting event reliability after those modules exist is far more expensive than designing it in now.
- **Distributed tracing (ADR-0027):** OpenTelemetry instrumentation adopted here, not deferred, so `correlationId` propagation through the outbox is present from the first event any later phase publishes.
- Permissions/RBAC module and guards, including the new `DATA_QUALITY_REVIEWER` and `FEATURE_MANAGER` roles, and the dual-control approval flow.
- Logging, audit-log infrastructure, monitoring/health endpoints.
- Storage provider adapter (S3/MinIO).
- **Exit criteria:** a rider can obtain a guest session and register via at least one provider; an admin can log in with RBAC enforced; audit log captures a real mutation end-to-end; a versioned config value can be published, resolved, and rolled back end-to-end; a high-risk config change correctly requires a second admin's approval before taking effect; a feature flag can be toggled and observed as resolved differently by two simulated riders in different rollout buckets; a published event is traceable end-to-end via its `correlationId`; a deliberately-failing consumer correctly dead-letters its event after the configured retry ceiling and fires an alert.

## Phase 4 — Maps Platform

- `MapProvider`/`RoutingProvider`/`GeocodingProvider`/`TrafficProvider` ports + adapters (self-hosted OSRM/Nominatim single-VM + OSM tiles; static time-of-day `TrafficProvider` adapter, ADR-0012), all accepting a `cityId`/region parameter from the start (Improvement Report A5).
- Mobile map rendering integration (`flutter_map`).
- Route/distance/duration computation service used by the Fare Policy Engine's orchestration (Phase 5).
- **Exit criteria:** given an origin/destination in Alexandria, the system returns a route, distance, and duration end-to-end through the abstraction layer.

## Phase 5 — Trip Platform *(includes the Fare Policy Engine as its own module)*

- **Fare Policy Engine** (ADR-0021), built and unit-tested *before* Trip's orchestration layer consumes it: `FarePolicyVersion` aggregate, `FarePolicyEngine.computeFareRange` as a pure, exhaustively table-driven-tested function, admin publish/rollback endpoints.
- Trip Engine (lifecycle: estimate → active → completed/cancelled), with its `FareEstimationService` reduced to orchestration only (routing + traffic + a synchronous call into Fare Policy Engine), plus provenance recording (ADR-0022) on every estimate.
- GPS Engine (mobile capture + offline buffering; backend ingestion, idempotent per `clientPingId`, ADR-0015).
- History & Statistics module.
- **Exit criteria:** full guest user flow (PRD §6) works end-to-end in staging: estimate, start, live-track, complete, actual fare recorded; a historical trip's fare is exactly reproducible by replaying `computeFareRange` against its stored `farePolicyVersionId` (regression-test category, Testing Strategy).

## Phase 6 — Trust Platform *(Data Quality Platform is built alongside, as a structurally independent parallel workstream)*

- Trust Engine: `TrustSignalEvaluator` pipeline (GPS continuity, plausibility checks, duplicate/impossible-trip detection, spoofing indicators), consuming `GpsThresholdConfig`/`FraudThresholdConfig` (Phase 3).
- Fraud/anomaly aggregate-behavior detection.
- Trust Review Queue (admin-facing, `TRUST_REVIEWER` role).
- **Data Quality Platform** (ADR-0019, ADR-0020) — built in this same phase because it consumes the same `TripCompleted` event and shares infrastructure (outbox consumption pattern, geo-metrics library) with Trust, even though it is a structurally separate context answering a different question: `DataQualityScoringEngine` component evaluators (GPS/Route/Fare/User-Input/Device-Signals), `readinessStatus` determination, `trip_feature_snapshot` persistence (with `featureSchemaVersion`), the Manual Review Queue state machine (with the corrected `idx_review_case_one_open_per_trip` index covering both `PENDING_REVIEW` and `ESCALATED`, Pre-Implementation Audit §3), and the `dataquality.ml_ready_trip_dataset` structural gate.
- `engine_version` bump discipline enforced by CI from this phase onward (Coding Standards) — the reproducibility promise for both Trust and Data Quality verdicts depends on it from their first shipped version.
- **Exit criteria:** every completed trip receives both a trust verdict *and* a data-quality assessment, computed independently; adversarial test suite (Testing Strategy §2) passes for Trust; a Data Quality adversarial/edge-case suite (missing fields, low GPS accuracy, ambiguous scores) passes for Data Quality; flagged trips reach the Trust admin review queue; suspicious/under-review trips reach the *separate* Data Quality review queue and cannot reach `READY_FOR_AI` without a resolved case; a trip cannot have two simultaneously-open review cases even across an `ESCALATED` transition.

## Phase 7 — Rewards Platform

- Points/Wallet module, reward ledger.
- Reward rule engine wired to `TripVerified` events.
- **Reward clawback** (ADR-0025, Pre-Implementation Audit §1): `RewardWallet`/`RedemptionService` handle the `CLAWBACK` ledger entry type, consuming `DataReviewCaseResolved` (`MERGED`/`REJECTED`) from Data Quality; wallet balance can go negative and redemption is blocked while it is; rider-facing wallet history surfaces a clawback with plain-language context (a product/support deliverable alongside the engineering mechanism).
- Reward Provider adapters (internal coupon engine first).
- Redemption flow requiring registration.
- **Exit criteria:** a verified trip grants points; a registered rider can redeem points for an offer; guest-to-registered promotion correctly carries over accrued points; a trip later found to be a duplicate/fraud by Data Quality review correctly reverses its reward via a `CLAWBACK` entry, and redemption is correctly blocked while the wallet is negative.

## Phase 8 — Advertising Platform

- Merchant and Campaign modules; geofencing/route/radius targeting, reading defaults from `AdvertisingTargetConfig` (Phase 3).
- V1 targeting arbitration only (single best match, ADR-0014) — full priority/budget-pacing logic explicitly deferred (Improvement Report C2).
- Ad-serve call cadence enforced at trip-lifecycle moments only (ADR-0014), never per raw GPS ping.
- Impression/click tracking, merchant analytics.
- **Exit criteria:** a pilot merchant campaign serves correctly targeted impressions during real trips, with accurate budget decrement and click tracking, at the specified call cadence.

## Phase 9 — Administration Platform

- Complete the admin dashboard across all domains (users, trips, rewards, merchants, ads, heatmaps, reports, analytics, configuration, audit logs, monitoring, system health) — **plus, added in this revision:** the Data Quality Review Queue UI (distinct from the Trust Review Queue), Feature Management UI (flags/segments/experiments, with kill switches visually distinguished given their fast-propagation behavior), and Fare Policy publish/rollback UI.
- **Exit criteria:** an operator can run day-to-day platform operations entirely through the admin dashboard without direct DB access, including resolving a Data Quality review case, toggling a kill switch, and publishing/rolling back a fare policy version.

## Phase 10 — Optimization

- Performance profiling, caching rollout (Scalability Plan §4), DB index/partition tuning.
- Security hardening pass and (recommended) third-party penetration test.
- Load/stress testing against Scalability Plan targets.
- Final documentation pass across all Phase 1 documents, updated to reflect actual as-built decisions.
- **Exit criteria:** platform meets non-functional targets (Scalability Plan §9) under simulated city-scale load; security review complete; MVP declared production-ready.

## Post-MVP Horizon (tracked, not yet scheduled)

- Additional Egyptian cities (enabled by City-scoped config, Scalability Plan §6).
- Additional reward/ad providers (enabled by Provider Abstraction, ADR-0003).
- ML-based fare prediction as an alternate strategy behind the Fare Policy Engine's `computeFareRange` interface, trained against `dataquality.ml_ready_trip_dataset` (Architecture §10).
- Advertising billing (Phase 8+ deferred scope, pending legal/compliance review — Risk Analysis §4).
- Full priority-weighted, budget-paced advertising arbitration (Improvement Report C2 / ADR-0014) — once real merchant volume creates genuine overlapping-targeting competition.
- Hardware attestation (Play Integrity/App Attest) gating guest-identity reward accrual (ADR-0009) — if real abuse telemetry justifies it.
- Percentage-rollout/segment targeting beyond MVP's scope (Feature Management Platform, ADR-0018) already ships at MVP per this revision — this line item is retained from the prior roadmap only to note it is no longer deferred, having been pulled forward into Phase 3.
- **Public API context** (Pre-Implementation Audit §1/§9): API-key/OAuth2-client-credential access for partners/researchers/government, its own rate-limiting scope and independently-versioned contract, sitting alongside Administration as a composition layer over a deliberately narrower capability set. Not built at MVP; the seam is named now (Architecture §4) specifically so this is an anticipated extension, not a rushed retrofit, when the request eventually comes.
- **Service-tier dimension on Fare Policy** (Pre-Implementation Audit §1): if the platform ever needs concurrent fare policies per service tier within one city, `FarePolicyVersion`'s resolution key and `Trip`'s schema both need a `serviceTier` dimension added — a documented, not urgent, forward-looking change.
- **`POLICY_MANAGER` role** narrower than `SUPER_ADMIN` for fare-policy publishing specifically (Security Model §3) — once a distinct team owns fare-policy compliance separate from platform administration.

## Roadmap Governance

- This roadmap is a living document, revisited at the end of every phase.
- No phase begins implementation before its architectural review is complete; no phase is marked complete without passing its Quality Requirements (tests, docs, security/performance review) per the master prompt's engineering principles.
- **Architecture freeze, effective from Phase 2 (added — see `20-change-control-and-definition-of-done.md`):** the architecture approved by the Pre-Implementation Audit is frozen. Any change to it — however small — requires a written ADR, a documented justification, an impact analysis, and a migration strategy before implementation proceeds; there is no architectural shortcut. Business logic must never redefine architectural boundaries — if implementation seems to require it, that's a signal to write an ADR, not to route around the boundary in code.
- **Each phase's "Exit criteria" above is necessary but not sufficient.** Every phase from Phase 2 onward must additionally satisfy the full Definition of Done in `20-change-control-and-definition-of-done.md` §3 (architecture validation, tests passing, documentation updated, zero known critical bugs, zero duplicated business logic, no TODOs, no temporary implementations, no commented-out production code) before the next phase begins. If any condition fails: stop, fix, then continue — a phase does not partially complete.
