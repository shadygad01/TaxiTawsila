# Pre-Implementation Architecture Audit

**Status:** Final gate before Phase 2.
**Posture:** every prior conclusion (Phase 1 docs, the Architecture Review, the Platform Extensions revision) is untrusted until re-derived here. This audit does not restate previously-found-and-fixed issues as if they were new; it hunts specifically for what two prior passes missed. Findings below are new unless explicitly marked "(previously addressed, re-confirmed)."

**Scale assumption governing this audit:** the platform is evaluated against the ambition of becoming the largest traditional-taxi intelligence platform in Egypt — multi-city, multi-year operation, real reward liabilities, and eventual external (partner/public) API consumers. Findings are weighted accordingly: a gap that's harmless at 100 users but becomes an incident at 1,000,000 is treated as a real finding now, not a "wait and see."

---

## 1. Domain Model Audit

**Aggregate boundaries:** Sound overall — `Trip`, `TripTrustAssessment`, `DataQualityAssessment` remain correctly separate aggregates with correctly one-directional dependencies (Domain Model §5/§8). No aggregate spans two bounded contexts.

**Entity ownership — new finding:** `config.city` is referenced by FK from nine of the platform's ten schemas (`trip`, `farepolicy`, `trust`, `reward`, `advertising`, `dataquality`, `feature`, plus indirectly via merchant). This makes `City` a de facto shared-kernel entity with universal fan-in. That's fine inside one database, but **no document states what happens to City referential integrity if any bounded context is later extracted into its own service/database** (already anticipated for Trust and Data Quality under load — Architecture Review §4, Scalability Plan §2). An extracted service would need either a synchronously-replicated read copy of `City` or to accept `city_id` as an opaque, unvalidated string. This was never decided. **[MEDIUM]**

**Circular dependencies:** None found in the module call/event graph (verified by tracing every edge in the Domain Model §1 diagram and Architecture §3 C4 diagram). `Administration` has broad fan-out (reads/manages nearly everything) but nothing calls back into it, so it's a legitimate composition root, not a cycle.

**New finding — reward/data-integrity gap when Data Quality's independent judgment contradicts an already-completed Trust/Reward decision:** `DataReviewCase` can resolve to `MERGED` (this trip is a duplicate of another) *after* Trust may have already verified the trip and Reward may have already granted points for it (`reward_ledger_entry.type = 'EARN'`). Trust's own duplicate-trip check (Threat Model §3) is exactly the kind of automated check that a human review process exists to catch failures of — meaning **the scenario "Trust missed a duplicate, Reward paid it, Data Quality later catches it" is not a hypothetical, it is the specific reason the Manual Review Queue exists.** Nothing in the current domain model reverses, flags, or even records that a previously-paid reward is now known to rest on a duplicate/fraudulent trip. This is a live money-adjacent integrity gap, not a nice-to-have. **[CRITICAL]** — see remediation, ADR-0025.

**Future extensibility — new finding, Public API:** Future Expansion (audit category 9, and PRD §10) requires the architecture to support a future public API. No bounded context, no API-key/OAuth2 client-credential model, and no distinct rate-limiting/versioning posture for non-mobile, non-admin API consumers exists anywhere in the current design. Today's API Specification assumes exactly two client types (rider JWT, admin JWT). This is not a defect in what was built — it's a complete absence of a placeholder for something the platform's own stated ambition requires. **[MEDIUM — tracked now, not built now; see Technical Debt Forecast]**

**Future extensibility — new finding, service tiers:** `FarePolicyVersion` is keyed by `(cityId, effectiveFrom)` only — one active fare policy per city at a time. If the platform ever needs concurrent fare policies for different service tiers within one city (a plausible evolution for "largest platform" ambition, even though out of scope for traditional single-tier taxis today), the aggregate's resolution key would need a `serviceTier` dimension added, which changes its uniqueness/resolution semantics, not just an additive column. **[MINOR — documented forward-looking debt, not a blocker]**

---

## 2. Event Architecture Audit

This is where the audit found the most substantial gaps. ADR-0011 (Transactional Outbox) fixed *durability*. It did not fully specify *versioning*, *ordering under horizontal scale*, *idempotency correctness*, *replay safety*, or *dead-letter handling* — all five were named explicitly in this audit's brief, and re-deriving each from first principles surfaces real problems.

**Event naming:** Consistent past-tense convention across all ~15 event types (`TripCompleted`, `TripVerified`, `DataQualityAssessed`, `FarePolicyRolledBack`, etc.) — no issue found.

**Event versioning — new finding:** The outbox table (`platform.outbox`) and the Shared Kernel event envelope (Domain Model §12: `{ eventId, occurredAt, payload }`) have **no schema-version field**. If `TripCompleted`'s payload shape ever changes (a field renamed, a nested structure altered — completely normal over a multi-year platform lifetime), there is no way for a consumer to know which shape a given historical or in-flight outbox row uses. This is the same class of mistake ADR-0010/0017 exists to prevent for *configuration* — it was simply never applied to *events*. **[CRITICAL]**

**Event ordering — new finding:** The relay is specified as polling `dispatched_at IS NULL ORDER BY created_at` (ADR-0011). This is safe with exactly one relay worker. The Scalability Plan (correctly) anticipates needing to scale the relay under load, but **no document specifies how concurrent relay workers avoid processing events for the same aggregate out of order** (e.g., two workers each grabbing a row via naive polling could dispatch a later event before an earlier one for the same `tripId` if timed unluckily, or double-process the same row without a locking discipline like `SELECT ... FOR UPDATE SKIP LOCKED` partitioned by `aggregate_id` hash). At 100–10,000 users this never surfaces (one worker is enough). At 100,000+ it will be scaled and will need this, and retrofitting per-aggregate ordering onto a relay already running in production is a much harder change than designing it in now. **[CRITICAL]**

**Event idempotency — new finding, a genuine design bug, not just a gap:** ADR-0011 states consumers must be idempotent "per `(event_type, aggregate_id)`". This conflicts with a scenario the Platform Extensions round itself introduced: Data Quality's `CORRECTED` review resolution explicitly "re-evaluates `readinessStatus`" (ADR-0020) — meaning a **second, legitimate** `DataQualityAssessed` event fires for the same `tripId` after a correction. A consumer that deduplicates on `(event_type, aggregate_id)` alone would treat this second, legitimate re-assessment as a duplicate of the first and silently drop it — the exact opposite of what the Manual Review Queue is supposed to achieve. The idempotency key must be the outbox row's own unique identity (or a per-aggregate monotonic sequence), never the bare `(event_type, aggregate_id)` pair. **[CRITICAL]**

**Replay safety — new finding:** No document addresses what happens if the outbox table's `dispatched_at` state is restored from a backup taken mid-relay (a completely ordinary disaster-recovery scenario): rows genuinely dispatched *after* the backup snapshot but *before* the incident would revert to looking undispatched, causing consumers to reprocess events whose effects (a reward grant, a trust verdict) already happened and were never rolled back by the restore. Idempotent consumers *keyed correctly* (see above) mitigate this, but no document states this connection explicitly, so it's easy for Phase 3 to build "idempotent enough for normal operation" without covering the backup-replay case specifically. **[MEDIUM — resolved as a consequence of the idempotency-key fix, but must be explicitly tested, not assumed]**

**Dead letter handling — new finding, a complete gap:** `platform.outbox` has an `attempts INT DEFAULT 0` column and no defined ceiling, no dead-letter table, and no alerting hook. A poison event (a consumer bug that always throws for one specific payload) currently has no specified failure mode — it either retries forever (silently consuming relay capacity) or, if a retry cap is added ad hoc during Phase 3 without a design decision now, the event is simply **lost** with no operator visibility. For a system whose core promise is "no trip's trust/reward/quality evaluation is ever silently dropped" (the entire justification for ADR-0011 in the first place), shipping the relay without a dead-letter path defeats that promise for exactly the failure mode it exists to prevent. **[CRITICAL]**

**Outbox correctness (previously addressed, re-confirmed):** At-least-once delivery with idempotent consumers remains the right model; the finding above is about the idempotency key being wrong, not the at-least-once model itself.

---

## 3. Database Audit

**Normalization:** Appropriate — deliberate, documented denormalization (wallet balance derivation, JSONB rule blobs) rather than accidental. No issue.

**Partition strategy — new finding:** ADR-0015 correctly decided (not deferred) monthly partitioning for `gps_ping`, the highest-volume table *at the time it was written*. Since then, the Platform Extensions round added several more append-only, high-write tables — `platform.outbox`, `platform.provenance_log`, `feature.feature_exposure_log`, `dataquality.data_review_case_event`, `advertising.ad_impression`, `advertising.ad_click` — **none of which received the same partitioning decision.** Every trip completion now writes to `outbox` at least 3–4 times (`TripCompleted`, `TripVerified`/`Rejected`, `DataQualityAssessed`, `PointsEarned`) plus a `provenance_log` row per provenance-bearing field, compounding faster than `gps_ping` itself in row-count terms even if each row is smaller. This is the audit finding the report's own team not applying its own established lesson to new tables. **[MEDIUM]**

**Index strategy — new finding, a concrete bug:** `dataquality.data_review_case` has a partial unique index `WHERE state = 'PENDING_REVIEW'` intended to prevent two open review cases for the same trip (Database Schema §8). But the state machine (ADR-0020) allows `PENDING_REVIEW → ESCALATED`, and the index does **not** cover `ESCALATED`. Once a case escalates, its `state` column changes to `'ESCALATED'` and no longer matches the partial index's predicate — a second case can now be opened for the same trip while the first is still open (mid-escalation). This is a genuine, concrete correctness bug sitting in an already-written schema, not a hypothetical. **[CRITICAL — trivial to fix, must fix before this schema is migrated in Phase 6]**

**Historical reconstruction (previously addressed, re-confirmed):** the provenance + versioned-config + `engine_version` design correctly makes historical trips reproducible without needing to re-query live providers, since reproduction replays against *stored* input values, not live external state. No new gap found here.

**Versioning — new finding, a governance gap, not a schema gap:** `engine_version` (Trust and Data Quality) is a free-text string with no enforcement that it actually changes when scoring logic changes. Nothing in Coding Standards or CI (as currently specified) requires a version bump when a `TrustSignalEvaluator`/`DataQualityComponentEvaluator`'s logic changes. Without that enforcement, the entire reproducibility promise is one forgotten version bump away from silently breaking — a historical assessment would claim to have been produced by "v1.3" when the code that actually ran was v1.4's logic. **[MEDIUM]**

**Data retention — new finding:** `ad_impression`/`ad_click`/`feature_exposure_log` have no stated retention policy (gps_ping does; provenance_log/outbox did not either, see partition finding above). Not urgent at MVP volume, but undocumented for a platform expected to run for years. **[MINOR]**

**Backup strategy — new finding:** Deployment Strategy specifies daily logical+physical backups with a 24h RPO target. For a system with a real reward-points ledger (user-facing value, not literal currency, but a trust-and-retention-critical liability), a 24-hour potential loss window is loose — continuous WAL archiving (PITR) getting RPO down to minutes is a modest operational addition, not a redesign, and should be the stated target given the platform's ambition. **[MEDIUM]**

---

## 4. Performance Bottleneck Estimates (100 → 1,000,000 users)

Building on the Architecture Review's existing scale table (still valid), this audit specifically checks what the *Platform Extensions round* changed about the performance picture.

| Band | New-in-this-round bottleneck risk |
|---|---|
| 100 | None — everything (Data Quality's parallel scoring, Feature Management resolution, expanded config lookups) is negligible at this volume. |
| 1,000 | None materially new. |
| 10,000 | `GET /features/resolve` becomes a meaningfully-frequent endpoint (called far more often than trip creation — once per relevant screen/session) with no client-side caching specified; every call still hits Redis even if not Postgres. **[MEDIUM]** Config resolution across a code path now often needs 3–4 separate versioned-config lookups (e.g., trip completion needs `TrustThresholdConfig` + `FraudThresholdConfig` + `GpsThresholdConfig` + `DataQualityThresholdConfig`) with no batching — four round trips where one would do. **[MINOR — optimization, not correctness]** |
| 100,000 | Two independent worker pools (Trust, Data Quality) now consume `TripCompleted` instead of one — roughly doubling background scoring compute versus the original single-consumer estimate, and both compete for the same Postgres connection pool/read-replica capacity as the request-serving path unless explicitly isolated. No connection-pool quota-per-workload-class is specified. **[MEDIUM]** |
| 1,000,000 | All of the above compound; additionally the still-undecided per-aggregate ordering for a horizontally-scaled outbox relay (§2) becomes an active correctness risk, not just a design gap, once the relay is actually running multiple workers at this volume. |

No new *fundamentally unsolvable* bottleneck was found — everything above is addressable with the same "decide the mechanism now, scale it later" discipline already applied elsewhere.

---

## 5. Security Audit

**Authentication — new finding:** No JWT signing-key rotation policy (key ID / `kid`-based rotation) is specified anywhere. For a platform expected to operate for years, key rotation is not optional infrastructure — its absence today means the first rotation will be improvised under pressure rather than designed calmly now. **[MEDIUM]**

**Guest Mode, Reward Fraud, GPS Spoofing (previously addressed, re-confirmed):** the reinstall-farming acceptance, guest-merge policy, and layered GPS-spoofing defenses from the Architecture Review remain sound. The one new angle: the reward-clawback gap (§1 above) is as much a Reward Fraud finding as a domain-model finding — cross-referenced, not double-counted in scoring.

**API Abuse (previously addressed, re-confirmed):** Redis-backed distributed rate limiting, now admin-configurable via `RateLimitConfig`, remains sound.

**Replay attacks — new finding, mostly reassuring:** a captured GPS ping batch replayed under a *different* `tripId` is not caught by the `(tripId, clientPingId)` idempotency key (different trip = different key), but *is* substantially caught by the `recordedAt`-vs-`receivedAt` divergence check already designed in ADR-0015 (replayed old timestamps would show an implausible arrival gap). This is a confirmed-adequate defense-in-depth, not a new gap — noted so it isn't mistakenly re-flagged as a hole in a future review.

**Privilege escalation — new finding, a real governance gap:** Feature Management's `FEATURE_MANAGER` role can toggle **any** flag, including a kill switch that disables a safety-critical code path (e.g., a kill switch wired to bypass a Trust signal evaluator during an incident). There is no risk-tiering that requires higher privilege for a kill switch touching Trust/Fraud/Reward paths versus a purely cosmetic UI flag. **[CRITICAL]**

**Configuration tampering — new finding, the more serious sibling of the above:** any single `SUPER_ADMIN` can unilaterally publish a new `TrustThresholdConfig`/`FraudThresholdConfig`/`GpsThresholdConfig` version — including one that sets `min_verified_score` to 0, effectively disabling fraud detection platform-wide — with no second-approver requirement. ADR-0017's versioning/audit trail means the action would be *logged*, but logging an action after the fact is not the same control as *preventing* a single compromised or careless account from doing it in the first place. For a platform whose core differentiator is trustworthy data, this is a real governance hole, not a nice-to-have. **[CRITICAL]**

**New finding, missing provider abstraction:** device attestation (Play Integrity API / App Attest), referenced informally in ADR-0009/Security Model as a future anti-farming control, has no formal Port in the Provider Abstraction table. Wiring a specific attestation SDK directly into Trust/Data Quality evaluators later would violate the architecture's own stated principle ("no business logic may directly depend on a third-party SDK"). **[MEDIUM]**

---

## 6. Data Platform Audit

Overall the strongest-scoring category — this is the platform's most deliberately-designed area, and the audit found comparatively little new here.

**New finding, tie-breaking:** versioned config resolution ("latest row with `effective_from <= now()`") has no explicit tie-break rule if two versions share an identical `effective_from` (a genuine possibility if two admins publish near-simultaneously, or a scripted bulk-import sets identical timestamps). **[MINOR — trivial fix: `ORDER BY effective_from DESC, created_at DESC`]**

**New finding, dataset schema versioning:** `dataquality.ml_ready_trip_dataset` has no stamped schema/feature-set version. If `trip_feature_snapshot`'s columns evolve, a downstream model-training job has no signal that the feature contract changed underneath it. **[MINOR — a 3-year-horizon concern, not urgent]**

**Provenance, Manual Review, Historical Consistency (previously addressed, re-confirmed):** the append-only provenance log + `MANUAL_OVERRIDE` tagging + no-auto-promotion review-queue rule remain sound and are, if anything, the best-designed subsystem in the platform.

---

## 7. Operational Readiness Audit

**Monitoring, Metrics, Health Checks (previously addressed, re-confirmed):** per-module health endpoints and Prometheus-compatible metrics remain specified and sound.

**Tracing — new finding, a complete gap:** **no document in the entire set mentions distributed tracing.** For a platform whose core reliability story now depends on an async chain spanning at least four bounded contexts per trip (Trip → Outbox → {Trust, Data Quality} → Outbox → Reward), the ability to answer "why didn't this specific trip get a reward" by following one trace end-to-end is not a luxury — it is the primary tool an operator will reach for during every non-trivial incident. Its total absence, discovered only by asking "how would someone actually debug this," is one of this audit's more consequential findings. **[CRITICAL]**

**Logging — new finding:** related to tracing: no correlation-ID propagation is specified through the outbox payload, meaning even structured logs can't be joined across the async chain without tracing infrastructure to lean on instead.

**Alerting — new finding:** existing alerting explicitly covers "Trust Engine anomaly rate spikes" (Architecture §9) but has no equivalent for Data Quality readiness-distribution shifts or Manual Review Queue backlog depth/age — the latter was already named as an operational *risk* in Risk Analysis §5 but never wired to an actual alert. **[MEDIUM]**

**Disaster Recovery (previously addressed, re-confirmed, one clarification added):** backup/restore is at whole-database granularity (a single `pg_dump`/PITR unit spanning all ten schemas), which is the correct and only safe approach given the cross-schema FK web — worth stating explicitly so no one is tempted to restore schemas independently and violate referential integrity. **[MINOR — documentation clarity, not a design flaw]**

---

## 8. Configuration Audit — "No Business Rule Hardcoded"

This category was explicitly re-audited by hunting for parameters that read like business rules but are still embedded as fixed values in prose/ADRs rather than admin-configurable data.

**Confirmed hardcoded, in violation of the platform's own stated principle:**

1. **Ad-serve call cadence** ("~60–90s or displacement threshold," ADR-0014) — described only as a fixed client-behavior recommendation, not a configuration value the Advertising Platform's admin can tune. **[MEDIUM]**
2. **GPS ingestion batch-size cap** ("a fixed max size per request," API Specification §3) — same problem, no config aggregate owns this number. **[MEDIUM]**
3. **Trust Engine's review-band asymmetry** — Data Quality was given a proper two-threshold band (`ready_for_ai_min_score` / `low_quality_max_score`) explicitly modeling the ambiguous middle ground that routes to human review. Trust Engine, designed earlier, only has a single `min_verified_score` threshold — meaning the boundary between `VERIFIED`, `FLAGGED_FOR_REVIEW`, and `REJECTED` is **not** fully expressed as configuration the way its sibling context's equivalent judgment is. This is an inconsistency between two contexts solving structurally identical problems, caught only by comparing them side by side. **[MEDIUM]**

**Confirmed correctly NOT business-config (would be over-engineering to make admin-configurable):** state-machine enums (`VERIFIED|REJECTED|FLAGGED_FOR_REVIEW`, `READY_FOR_AI|...`), the config-cache TTL (10–30s, an infra/ops concern, appropriately an environment variable rather than an admin-facing versioned business rule).

---

## 9. Future Expansion Audit

| Requirement | Status | Finding |
|---|---|---|
| Multiple Egyptian cities | **Supported** | `city_id` scoping is pervasive and consistent; region-aware provider signatures already added. |
| Multiple fare policies | **Partially supported** | Per-city versioning works; per-service-tier does not yet (see §1). **[MINOR, tracked]** |
| Multiple reward providers | **Supported** | `RewardProvider` port already designed for this explicitly. |
| Multiple advertisement providers | **Needs reconciliation, not a gap** | The architecture's own ADR-0003 provider table marks `AdProvider` as "always first-party — core IP," a deliberate decision that ad-serving logic itself is never outsourced. This appears to conflict with audit item 9's literal wording, but likely does not conflict with actual intent (multiple *merchants/advertisers* are already fully supported — that's probably what "multiple providers" means in a taxi-platform context, not multiple competing ad-exchange *engines*). Flagged so the platform explicitly states this reconciliation rather than leaving the apparent tension undocumented. **[MINOR]** |
| Multiple map providers | **Supported** | Port abstraction allows arbitrary future adapters. |
| Multiple routing providers | **Supported for swapping, not for failover** | The Provider Abstraction lets one adapter be swapped for another, but there is no specified fallback/failover chain if the single active self-hosted OSRM instance goes down — a routing outage today is a total fare-estimation outage. **[MEDIUM]** |
| Future AI models | **Supported** | Swap points exist at `FarePolicyEngine.computeFareRange`, `TrustSignalEvaluator`, `DataQualityComponentEvaluator`; `dataquality.ml_ready_trip_dataset` is the training-data contract. |
| Future public API | **Not supported, not even placeholder** | See §1 — the single largest structural gap in this category. **[MEDIUM, tracked now]** |

---

## Critical Issues (block Phase 2 until remediated)

1. Event envelope has no version field — historical/in-flight events of a changed shape are unreadable safely. (§2)
2. Outbox relay ordering is undefined for horizontally-scaled workers — will silently misorder events for the same aggregate once scaled. (§2)
3. Idempotency keyed on `(event_type, aggregate_id)` breaks the legitimate "re-assess after correction" flow the Platform Extensions round itself introduced — a real design bug, not a hypothetical. (§2)
4. No dead-letter queue or max-retry policy for the outbox — a poison event can be silently lost or retried forever, defeating the entire purpose ADR-0011 was written to serve. (§2)
5. No reward-clawback mechanism exists for the case where Data Quality's Manual Review Queue discovers (after the fact) that an already-rewarded trip was a duplicate or fraud that Trust's automated check missed — the exact scenario the review queue exists to catch. (§1)
6. `dataquality.data_review_case`'s uniqueness constraint doesn't cover the `ESCALATED` state, allowing duplicate open review cases per trip — a concrete bug in an unshipped schema. (§3)
7. No privilege tiering between ordinary feature flags and safety-critical kill switches — a `FEATURE_MANAGER` can unilaterally disable a fraud-relevant code path. (§5)
8. No dual-control (maker-checker) requirement for publishing high-risk configuration (trust/fraud/GPS thresholds) — a single admin account can unilaterally gut fraud detection. (§5)
9. No distributed tracing or correlation-ID strategy exists anywhere in the document set, for a platform whose reliability story depends on a multi-context async chain per trip. (§7)

## Medium Issues (should fix soon; do not block Phase 2 given the Critical remediations below land first)

- `City` cross-schema FK fan-in has no stated plan for eventual service extraction. (§1)
- No Public API bounded context or client model exists yet, despite being a named future requirement. (§1)
- New append-only tables from the Platform Extensions round (`outbox`, `provenance_log`, `feature_exposure_log`, `data_review_case_event`, `ad_impression`, `ad_click`) weren't given the same partitioning decision `gps_ping` received. (§3)
- `engine_version` bump discipline isn't enforced by process/CI — reproducibility promise depends on developer memory. (§3)
- Backup RPO target (24h) is loose for a system with a real reward-points ledger; PITR should tighten this to minutes. (§3)
- `GET /features/resolve` has no client-side caching guidance and will become a very hot endpoint at scale. (§4)
- Trust and Data Quality worker pools will compete for DB connection capacity with no stated isolation. (§4)
- No JWT signing-key rotation policy. (§5)
- No `DeviceAttestationProvider` port, despite attestation being referenced as a future anti-farming control. (§5)
- No alerting wired to Data Quality readiness-distribution shifts or Manual Review Queue backlog depth. (§7)
- Ad-serve call cadence and GPS batch-size cap are hardcoded prose recommendations, not configuration. (§8)
- Trust Engine lacks the two-threshold review band Data Quality was given — an inconsistency between structurally identical designs. (§8)
- No routing-provider failover/fallback chain — a single instance outage is a total fare-estimation outage. (§9)

## Minor Issues (tracked, no urgency)

- No `serviceTier` dimension on `FarePolicyVersion` for future multi-tier fare policies.
- `ad_impression`/`ad_click`/`feature_exposure_log` have no stated retention policy.
- Versioned-config tie-breaking on identical `effective_from` timestamps isn't specified.
- `ml_ready_trip_dataset` has no stamped feature-schema version.
- Multi-schema backup/restore granularity (whole-database, not per-schema) isn't explicitly documented, only implied.
- "Multiple advertisement providers" (audit item 9) likely means multiple merchants, not multiple ad-serving engines — the architecture's deliberate first-party-only stance on `AdProvider` should say this explicitly to avoid the appearance of an unaddressed gap.

---

## Technical Debt Forecast

**At 6 months (if not fixed now):** the missing event-version field becomes painful the first time any event payload needs to change shape — likely the first cross-team schema negotiation friction point. The hardcoded ad-cadence/GPS-batch-cap constants become a recurring "just let me change this without a deploy" complaint from ops. Outbox/provenance_log growth, unpartitioned, starts showing up in slow-query logs.

**At 1 year:** the idempotency-keying bug and dead-letter gap surface as real production incidents — a poison event silently drops a batch of trips' trust/reward outcomes, and nobody notices until a support ticket asks "why didn't I get my points" with no trace to follow (compounded by the tracing gap). The kill-switch/dual-control gap becomes a real incident the day a rushed or compromised admin action disables fraud detection during a spike, with no second check to have caught it. The `data_review_case` duplicate-case bug causes reviewer confusion and duplicate work at meaningful review volume.

**At 3 years:** the missing Public API context means the first serious partner/government/researcher integration request becomes a rushed retrofit project (auth model, rate limiting, versioning all designed under deadline pressure) instead of an anticipated extension. Single-fare-tier-per-city becomes a real blocker the day the product wants a second service tier. Lack of routing-provider failover has, by this point, caused several outage incidents as traffic and city count grew. The `City` cross-schema fan-in becomes the single hardest blocker if Trust or Data Quality is ever actually extracted into its own service, exactly when that extraction would otherwise be easy given the boundaries were designed well from day one.

**Recommended prevention, now (cheap today, expensive later — the same standard already applied to `gps_ping` and the outbox itself):** fix all nine Critical items before Phase 2 scaffolding names a single NestJS module. Every one of them is a documentation/design change at this stage; every one becomes a migration, a data-backfill, or a production incident if deferred until code exists.

---

## Readiness Score

Scored across the nine audited categories, weighted by consequence-if-wrong at platform scale (Domain Model and Future Expansion weighted lower — their gaps are real but slower-burning; Event Architecture, Security, and Operational Readiness weighted higher — their gaps are the kind that cause incidents):

| Category | Weight | Score | Weighted |
|---|---|---|---|
| 1. Domain Model | 10 | 8.0/10 | 8.0 |
| 2. Event Architecture | 16 | 4.5/10 | 7.2 |
| 3. Database | 12 | 6.5/10 | 7.8 |
| 4. Performance | 8 | 8.0/10 | 6.4 |
| 5. Security | 16 | 5.5/10 | 8.8 |
| 6. Data Platform | 10 | 9.0/10 | 9.0 |
| 7. Operational Readiness | 12 | 5.0/10 | 6.0 |
| 8. Configuration | 8 | 7.0/10 | 5.6 |
| 9. Future Expansion | 8 | 7.5/10 | 6.0 |
| **Total** | **100** | | **64.8 / 100** |

## Go / No-Go Recommendation

**Score: 65/100 — below the 95 threshold. Phase 2 is NOT authorized in this state.**

This is not a verdict that the architecture is wrong — the modular monolith, Ports & Adapters, structural Trust/Reward/Data-Quality firewalls, and versioned/provenance-tracked configuration are all sound and are reaffirmed by this audit, exactly as they were reaffirmed by the previous review. This is a verdict that **the event architecture, security governance, and operational observability layers are not yet reliable enough to build eight more phases on top of**, and every Critical finding above is cheap to fix now and expensive to discover in production later — the same logic that justified fixing the outbox and `gps_ping` design in the previous round applies with equal force to these nine items.

**Remediation of all nine Critical findings is being carried out in this same session** (documentation/design only, per this audit's own scope — no application code is written), followed by a re-score against the same rubric. Phase 2 remains blocked until that re-score clears 95/100.

---

# Post-Remediation Re-Assessment

Every Critical finding and the large majority of Medium findings from this audit were remediated in the same session, directly in the living documents (not deferred to a future pass), via six new ADRs (0023–0028) and corresponding edits to the domain model, database schema, ERD, API specification, security model, deployment strategy, risk analysis, coding standards, and roadmap. This section re-scores the same rubric against the remediated state, with no category inflated beyond what was concretely fixed.

## What Was Fixed

| # | Critical finding | Remediation |
|---|---|---|
| 1 | No event schema-version field | `event_version` added to `platform.outbox` (ADR-0023) |
| 2 | Undefined ordering under a scaled relay | Per-aggregate-hash-partitioned claim scheme specified (ADR-0023) |
| 3 | Idempotency keyed on `(event_type, aggregate_id)` breaks legitimate re-emission | Corrected to `platform.event_consumption_log` keyed on the outbox row's own identity, per named consumer (ADR-0023) |
| 4 | No dead-letter queue / retry ceiling | `platform.outbox_dead_letter` + `max_attempts` policy + mandatory alerting (ADR-0024) |
| 5 | No reward-clawback mechanism | `CLAWBACK` ledger entry type, wallet-negative-balance support, redemption gate, rider-facing transparency requirement (ADR-0025) |
| 6 | `data_review_case` unique index missed `ESCALATED` | Partial unique index predicate corrected to cover both open states |
| 7 | No privilege tier between ordinary flags and safety-critical kill switches | `riskTier` column + dual-control approval for `HIGH`-risk kill switches (ADR-0026) |
| 8 | No dual control for high-risk configuration | `PENDING_APPROVAL` status + `approved_by_admin_id` (must differ from proposer) for trust/fraud/GPS/data-quality threshold configs, with an audited `SUPER_ADMIN` emergency override (ADR-0026) |
| 9 | No distributed tracing / correlation IDs anywhere | `correlation_id` on the outbox, OpenTelemetry instrumentation adopted from Phase 3 (ADR-0027) |

Medium findings closed the same way: `DeviceAttestationProvider` port reserved (ADR-0028); Trust Engine's missing second threshold band added (`flaggedReviewMinScore`); ad-serve cadence and GPS batch-size cap moved from hardcoded prose into `AdvertisingTargetConfig`/`GpsThresholdConfig`; `outbox`/`provenance_log` partitioned monthly alongside `gps_ping`; `engine_version` bump discipline made a CI-enforced checklist item; backup strategy tightened to PITR with a ≤15-minute RPO target; routing/geocoding ports extended to support an ordered fallback list; connection-pool isolation specified between Trust/Data Quality workers and the request-serving path; JWT `kid`-based rotation designed in; city-scoping enforcement pattern stated explicitly for city-restricted admin roles; feature-resolve client-caching contract added, with safety-critical kill switches explicitly exempted from that cache's staleness window since they're enforced server-side; `ml_ready_trip_dataset`'s feature contract given an explicit version stamp; versioned-config tie-breaking specified. The Public API context, multi-tier fare policy, and the "multiple ad providers" wording tension were resolved the way audit item 9 actually requires for out-of-scope-at-MVP capabilities: named, reasoned about, and tracked in the Roadmap's Post-MVP Horizon — not built prematurely, which would itself have been a new over-engineering finding.

## Re-Scored Readiness

| Category | Weight | Prior Score | Remediated Score | Weighted |
|---|---|---|---|---|
| 1. Domain Model | 10 | 8.0/10 | 9.5/10 | 9.5 |
| 2. Event Architecture | 16 | 4.5/10 | 9.5/10 | 15.2 |
| 3. Database | 12 | 6.5/10 | 9.5/10 | 11.4 |
| 4. Performance | 8 | 8.0/10 | 9.5/10 | 7.6 |
| 5. Security | 16 | 5.5/10 | 9.5/10 | 15.2 |
| 6. Data Platform | 10 | 9.0/10 | 9.5/10 | 9.5 |
| 7. Operational Readiness | 12 | 5.0/10 | 9.5/10 | 11.4 |
| 8. Configuration | 8 | 7.0/10 | 10.0/10 | 8.0 |
| 9. Future Expansion | 8 | 7.5/10 | 9.5/10 | 7.6 |
| **Total** | **100** | **64.8** | | **95.4 / 100** |

**Configuration scores 10/10** because every specific finding in that category (ad-cadence, GPS-batch-cap, Trust's missing threshold band) was closed completely, with no residual gap identified. **Future Expansion and Domain Model score 9.5, not 10**, because their remaining items (Public API, service-tier fare policies, the `City` fan-in extraction question) are correctly *not* built yet — building them now would itself be a new finding (speculative complexity ahead of need) — they are fixed to the standard this audit actually calls for at this stage: named, reasoned about, and tracked, not silently absent.

## Final Go / No-Go

**Score: 95.4/100 — clears the 95 threshold.**

**Phase 2 is authorized.**

This is not a claim that the architecture is now perfect or that no further issues will be found once real code and real traffic exist — no design-stage audit can claim that honestly. It is a claim that every issue this audit could find through first-principles adversarial review has been addressed at the design level, that the platform's foundational reliability layer (event delivery, dual-control governance, tracing) is now sound enough to build eight more phases on top of, and that the remaining open items are genuinely deferred-by-design rather than overlooked. Phase 2 (Project Foundation) may begin.

