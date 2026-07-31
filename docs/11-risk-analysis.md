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
| GPS accuracy in dense urban Alexandria (signal multipath from buildings) undermines Trust Engine and live tracking | H | M | Trust Engine explicitly scores GPS-signal-quality as its own weighted signal rather than assuming uniform accuracy; live tracking UI communicates uncertainty | Engineering |
| Single Postgres instance becomes a bottleneck under GPS-ping write volume at scale | M | M | Partitioning + read replicas planned (Scalability Plan); append-only design keeps write path simple to scale horizontally later | Engineering |
| Node.js event loop blocked by CPU-heavy Trust Engine batch scoring | L | M | Offload heavy scoring to background workers/queue (ADR-0007 consequences) | Engineering |

## 3. Data Quality Risks

| Risk | L | I | Mitigation | Owner |
|---|---|---|---|---|
| Fraudulent/fake trips pollute the ML-ready dataset | M | H | Layered Trust Engine defenses (Threat Model §3); rejected/flagged trips retained but labeled, never silently deleted, so future model training can explicitly exclude/weight them | Engineering/Data |
| Selection bias — only trips where users bother to enter actual fare are captured, skewing the dataset | H | M | Single-question completion flow minimizes non-response (PRD §7.3); track completion rate as a first-class metric and investigate skew before training any model on the data | Product/Data |
| Trust threshold miscalibration (too strict → legitimate trips rejected and rewards lost, eroding trust in the platform; too lenient → fraud passes) | M | H | Versioned, tunable thresholds per city (ADR-0010); `FLAGGED_FOR_REVIEW` human-in-the-loop tier avoids binary all-or-nothing calibration risk | Engineering |

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

## 6. Risk Review Cadence

Risk register reviewed at the end of each development phase (see Roadmap) and updated with newly discovered risks; no phase is considered "done" without a risk-register pass.
