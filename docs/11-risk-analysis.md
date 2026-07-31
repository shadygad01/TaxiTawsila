# Risk Analysis

**Status:** Draft v1.0 — Phase 1

Each risk rated Likelihood (L) / Impact (I) on Low/Medium/High, with owner and mitigation.

## 1. Business Risks

| Risk | L | I | Mitigation | Owner |
|---|---|---|---|---|
| Low guest activation (users abandon before completing trip → actual-fare entry) | M | H | Minimize completion friction to a single question (PRD §7.3); measure activation funnel from day one (PRD §9) | Product |
| Reward economics unsustainable (points cost more than value generated) | M | H | Configurable, versioned reward rules (ADR-0010) allow rapid tuning without redeploy; model reward cost against verified-trip volume before scaling merchant offers | Product/Finance |
| Merchants don't adopt advertising platform (no demand side) | M | M | Start with a small curated merchant pilot in Phase 8 before opening self-serve campaign creation | Product |
| Traditional taxi drivers perceive the platform as adversarial (fare transparency reduces negotiation leverage) | L | M | Platform is explicitly passenger-only with no driver-facing surface (Business Rules) — avoids direct conflict; messaging framed as fare *reference*, not enforcement | Product |

## 2. Technical Risks

| Risk | L | I | Mitigation | Owner |
|---|---|---|---|---|
| OSM data sparsity/inaccuracy in Alexandria degrades routing/geocoding quality | M | H | Data-quality audit in Phase 4; contribute corrections upstream; fall back to manual POI curation for high-traffic areas | Engineering |
| Hosted OSRM/Nominatim instance cost or reliability issues before self-hosting migration | M | M | Provider Abstraction (ADR-0003) makes migration an adapter swap; plan self-hosting migration trigger thresholds in Deployment Strategy | Engineering |
| **(revised, Pre-Implementation Audit §9)** Single-instance routing/geocoding outage is a total fare-estimation outage | M | H | `RoutingProvider`/`GeocodingProvider` ports now support an ordered fallback adapter list (Architecture §4), not just a swappable single adapter — a secondary instance (even a smaller/degraded one) must actually be provisioned and its failover path tested before public launch, not left as an unexercised design capability | Engineering/Ops |
| GPS accuracy in dense urban Alexandria (signal multipath from buildings) undermines Trust Engine and live tracking | H | M | Trust Engine explicitly scores GPS-signal-quality as its own weighted signal rather than assuming uniform accuracy; live tracking UI communicates uncertainty | Engineering |
| Single Postgres instance becomes a bottleneck under GPS-ping write volume at scale | M | M | Partitioning + read replicas planned (Scalability Plan); append-only design keeps write path simple to scale horizontally later | Engineering |
| Node.js event loop blocked by CPU-heavy Trust Engine batch scoring | L | M | Offload heavy scoring to background workers/queue (ADR-0007 consequences) | Engineering |
| **(added, Pre-Implementation Audit §2)** Event architecture reliability gaps (no event versioning, no dead-letter handling, incorrect idempotency keying) silently drop or misprocess trust/reward/data-quality outcomes | M *(now)* → L *(post-remediation)* | H | Closed via ADR-0023/ADR-0024: event envelope versioning, per-aggregate-ordered relay claiming, idempotency keyed on durable event identity via `event_consumption_log`, and a dead-letter table with mandatory alerting — all decided before Phase 2, per this audit | Engineering |
| **(added, Pre-Implementation Audit §7)** Total absence of distributed tracing makes diagnosing "why didn't this trip get X" incidents slow and error-prone as the async event chain grows | M | M | Closed via ADR-0027: OpenTelemetry instrumentation + `correlationId` propagation through the outbox from Phase 3 | Engineering |

## 3. Data Quality Risks

| Risk | L | I | Mitigation | Owner |
|---|---|---|---|---|
| Fraudulent/fake trips pollute the ML-ready dataset | M | H | Layered Trust Engine defenses (Threat Model §3); rejected/flagged trips retained but labeled, never silently deleted, so future model training can explicitly exclude/weight them | Engineering/Data |
| Selection bias — only trips where users bother to enter actual fare are captured, skewing the dataset | H | M | Single-question completion flow minimizes non-response (PRD §7.3); track completion rate as a first-class metric and investigate skew before training any model on the data | Product/Data |
| Trust threshold miscalibration (too strict → legitimate trips rejected and rewards lost, eroding trust in the platform; too lenient → fraud passes) | M | H | Versioned, tunable thresholds per city (ADR-0010); `FLAGGED_FOR_REVIEW` human-in-the-loop tier avoids binary all-or-nothing calibration risk | Engineering |
| **(added — Data Quality Platform)** Data Quality threshold miscalibration: too strict starves the `READY_FOR_AI` dataset of volume; too lenient lets weak data into ML training silently | M | H | `DataQualityThresholdConfig` is versioned/tunable per city (ADR-0017); `UNDER_REVIEW` human-in-the-loop tier mirrors Trust's calibration safety valve; dataset-ready rate tracked as a first-class metric (PRD §9) to catch drift early | Engineering/Data |
| **(added — Manual Review Queue)** Review backlog: `PENDING_REVIEW`/`ESCALATED` case volume grows faster than reviewer capacity, delaying trips' entry into the ML dataset indefinitely | M | M | No auto-promotion escape hatch exists by design (ADR-0020), so this risk is structural, not a bug to patch — mitigate operationally: staff `DATA_QUALITY_REVIEWER` capacity ahead of trip-volume growth, monitor queue depth/age as an ops metric, and revisit quality thresholds (not the no-auto-promotion rule) if the queue is chronically overloaded | Ops |
| **(added — Fare Policy Engine)** A published `FarePolicyVersion` contains an error (wrong distance-tier math, missing special adjustment) and mispricing propagates to every estimate until caught | L | H | `DRAFT` status allows staging/review before a version goes `ACTIVE`; rollback (ADR-0017) is a one-action fix once caught; replay-based regression tests (Testing Strategy, amended) catch a subset of errors before publish, not all — human review of a new version before publish remains the primary control | Engineering/Ops |

## 4. Legal / Regulatory Risks

| Risk | L | I | Mitigation | Owner |
|---|---|---|---|---|
| Egyptian data protection law (Law No. 151/2020) compliance gaps around location data and consent | M | H | Legal review required before public launch; Security Model §4/§8 designed directionally toward data minimization and deletion rights pending that review | Legal/Compliance |
| SMS OTP provider regulatory/telecom compliance in Egypt | L | M | Select a provider with local telecom compliance; abstracted behind `AuthenticationProvider` so provider can be swapped if needed | Engineering/Legal |
| Reward/coupon mechanics inadvertently classified as a regulated loyalty/financial instrument | L | M | Points are non-purchasable, non-cash-convertible by design (PRD §11 Out of Scope); confirm with legal before any future cash-equivalent feature | Legal/Compliance |
| Advertising billing (Phase 8+) introduces payment processing / tax obligations | L | M | Billing explicitly deferred to a future phase pending dedicated compliance review | Legal/Compliance |

## 5. Operational Risks

| Risk | L | I | Mitigation | Owner |
|---|---|---|---|---|
| Small team cannot operate 24/7 incident response at launch | M | M | Start with business-hours on-call, automated alerting (Architecture §9 Monitoring), clear escalation runbook (Deployment Strategy) | Engineering/Ops |
| No tested backup/restore process before a real incident | L | H | Backup + restore drill required before production launch (Deployment Strategy) | Engineering/Ops |
| Admin dashboard misuse due to insufficient RBAC granularity early on | L | M | RBAC roles defined from Phase 3 (Security Model §3), audit logging mandatory from day one | Engineering |
| **(added — Feature Management Platform)** Feature-flag/segment misconfiguration causes inconsistent rollout (a segment rule unintentionally excludes/includes the wrong riders) or a forgotten `PERCENTAGE_ROLLOUT` left partial indefinitely | M | M | Deterministic-hash resolution (ADR-0018) makes rollout behavior predictable and testable; `FEATURE_MANAGER` RBAC role scopes who can change flags; every change audit-logged; recommend a periodic admin review of long-lived partial rollouts (ops checklist item, not a system enforcement) | Ops |
| **(added — Provenance/Configuration Platforms)** Unbounded growth of `platform.provenance_log` and versioned-config history tables over time | L | L | Same append-only/partition-ready design philosophy as `gps_ping` (ADR-0015); not a day-one concern given comparatively low write volume (config changes are admin-driven, not per-trip), but tracked here so it isn't forgotten at very high scale/very long platform lifetime | Engineering |
| **(added, Pre-Implementation Audit §5, ADR-0026)** `SUPER_ADMIN` bus-factor: dual control for high-risk configuration is only a real control if more than one person genuinely holds this role — at MVP team size, a single-person `SUPER_ADMIN` roster reduces "second approver" to a technicality | M | H | Ensure at least two independent `SUPER_ADMIN` holders from launch, as an operational/staffing requirement, not just a technical one; the emergency-override path (ADR-0026) is itself audited so even a single-`SUPER_ADMIN` period is at least visible after the fact | Ops/Leadership |
| **(added, Pre-Implementation Audit §1, ADR-0025)** Reward clawback UX: a rider whose reward is reversed after a Data Quality review finds a duplicate/fraud sees an unexplained balance drop if not communicated clearly | L | M | `CLAWBACK` ledger entries must be surfaced transparently in rider-facing wallet history (API Specification, Phase 7), with plain-language context — a support/product responsibility to design before Phase 7 ships, not just an engineering mechanism | Product/Support |
| **(added, Pre-Implementation Audit §1/§9)** No Public API bounded context exists yet; the first serious partner/government/researcher integration request becomes a rushed retrofit rather than a planned extension | L | M | Explicitly reserved (not built) in Architecture §4 and tracked in the Roadmap's Post-MVP Horizon — the goal is to have named the shape of the eventual solution now so it isn't designed under deadline pressure later | Product/Engineering |

## 6. Risk Review Cadence

Risk register reviewed at the end of each development phase (see Roadmap) and updated with newly discovered risks; no phase is considered "done" without a risk-register pass.
