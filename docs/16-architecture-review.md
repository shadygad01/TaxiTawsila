# Architecture Review Report

**Status:** v1.0 — Adversarial review of the Phase 1 architecture, performed before Phase 2 (Project Foundation) begins.
**Posture:** every decision in `02-architecture.md` through `15-roadmap.md` is treated as unproven until it survives this review. Where a decision holds, it is reaffirmed with sharper justification. Where it doesn't, it is marked **REDESIGN** or **MODIFY** and carried into `17-architecture-improvements.md`.

**Scale bands used throughout** (interpreted as MAU, translated to load where relevant, assuming ~1 trip per active user per 3–4 days as a rough MVP-market ridership rate, and a ~12–15 min average trip generating one GPS ping every 3–5s):

| Band | MAU | Approx. trips/day | Approx. GPS pings/day | Concurrent active trips (peak) |
|---|---|---|---|---|
| 100 | 100 | 25–35 | ~7k | ~5 |
| 1,000 | 1,000 | 250–350 | ~70k | ~30 |
| 10,000 | 10,000 | 2,500–3,500 | ~700k | ~250 |
| 100,000 | 100,000 | 25,000–35,000 | ~7M | ~2,500 |
| 1,000,000 | 1,000,000 | 250,000–350,000 | ~70M | ~25,000 |

These numbers are directional, not commitments — their purpose is to force every subsystem to answer "does this design still work here?" rather than reason in the abstract.

---

## Overall Verdict

The core architectural bets — modular monolith with enforced module boundaries, Ports & Adapters for every external dependency, an isolated Trust Engine that structurally cannot be bypassed by Rewards, and versioned/append-only data — **hold up** and are reaffirmed. They are not the problem.

The problems found are concentrated in four places, all of which are correctness or cost risks that get *harder to fix retroactively* the longer they're deferred, which is why they're flagged now rather than in Phase 10:

1. **Event delivery has no durability guarantee.** The architecture describes an in-process event bus with a vague promise to "swap it for a real broker later." That's backwards: the one property that must be true from day one is *a completed trip's trust evaluation is never silently dropped*. This is a correctness gap, not a scaling gap, and it's cheap to fix now (transactional outbox) and expensive to discover in production later (silently-unverified trips, un-rewarded users, support tickets with no root cause).
2. **The GPS-ping write/index path was over-specified in the wrong place and under-specified in the right one.** A GiST spatial index was put on every raw ping (unnecessary — nothing queries ping-level spatial containment) while the actual scale risk — write amplification and index bloat from tens of millions of rows/day at the upper bands — was acknowledged only as "consider partitioning later." This should be decided now, because it changes the table design, not just an index added later.
3. **Two silent single-instance assumptions will break the moment the backend is horizontally scaled**: in-memory rate limiting and in-memory config caching. Neither was called out as an assumption in the original docs, which means Phase 3 could easily ship them as "done" and only discover the bug at the 10,000–100,000 band when a second instance is added.
4. **The PRD promises a fare estimation input (traffic) that no subsystem actually delivers.** There is no `TrafficProvider` port. This is a documentation/scope integrity problem more than a technical one, but it's exactly the kind of gap that causes Phase 5 to either quietly under-deliver or improvise an unreviewed shortcut.

None of these require abandoning the modular monolith, the domain model, or the bounded contexts. They require targeted redesign of specific mechanisms before Phase 2 scaffolding encodes the wrong assumptions into module boundaries.

---

## 1. Domain Boundaries

**Current design:** 7 bounded contexts (Identity, Trip, Trust, Reward, Advertising, Configuration, Admin), each a schema + module, communicating via application-service calls or domain events.

**Why:** matches natural business ownership lines; each context has a distinct data-integrity story (Trust) or a distinct extensibility axis (Reward/Ad providers).

**Alternatives considered:** (a) fewer, coarser contexts (e.g., merge Trust into Trip) — rejected, would violate the "Rewards cannot see fare data directly" integrity guarantee (ADR-0008); (b) finer contexts (e.g., split GPS Engine and Fare Engine out of "Trip" into their own top-level bounded contexts) — worth revisiting, see finding below.

**Finding — inconsistency, not a flaw:** `02-architecture.md`'s C4 diagram shows `TripMod`, `GPSMod`, `FareMod`, `HistMod` as four separate modules under "Trip Platform," but `03-domain-model.md` defines only one `Trip` aggregate with GPS pings as a child entity and no distinct Fare/History aggregates. This is a real drift between two Phase 1 documents, not a deep design flaw — but it means Phase 2 scaffolding would have to guess which is authoritative. **Resolution:** the Domain Model is authoritative (one `Trip` aggregate root); `GPSMod`/`FareMod`/`HistMod` in the architecture diagram should be read as *internal service classes within the Trip module*, not sibling Nest modules with their own public interface. Fare estimation logic, in particular, must stay a domain service invoked by Trip, not a separate module, because "estimate" and "actual fare" are properties of the same aggregate and must never be editable through two different write paths. **Action:** correct the C4 diagram/labels (Improvement Report item).

**Scale behavior:** domain boundaries are a code-organization concern, not a runtime one — they don't degrade with user count. The only scale-linked question is *which module gets extracted into its own service first*, and the answer doesn't change at any band below 100,000: Trust Engine remains the first extraction candidate once its scoring workload (not user count directly) becomes CPU-bound.

**Verdict: KEEP**, with the C4/domain-model relabeling above.

---

## 2. Database Design

**Current design:** single PostgreSQL+PostGIS instance, schema-per-context, versioned append-only config, append-only ledgers.

**Why:** transactional guarantees for money-adjacent data (reward ledger), open-source/self-hostable, strong geospatial support, one operational system at MVP.

**Alternatives:** polyglot persistence (time-series DB for GPS, document store for events) — rejected at MVP as premature operational complexity; correct to reject *now*, but the schema itself needs revision (see GPS Tracking §15 and Improvement Report).

**Trade-offs:** a single Postgres primary is a write bottleneck ceiling; accepted consciously, with read replicas + partitioning as the mitigation path (Scalability Plan). This remains the right trade-off through the 10,000 band; it becomes the dominant constraint at 100,000+.

**Scale behavior:**
- **100–1,000:** trivially fine on a single small instance; partitioning/replicas are premature.
- **10,000:** ~700k pings/day (~8 writes/sec average, bursty around peak hours) — still comfortable for a properly-indexed single primary, but this is the point to add PgBouncer and start read replicas for admin/analytics traffic *before* it's an emergency, not after.
- **100,000:** ~7M pings/day (~80 writes/sec average, several hundred/sec at peak) — this is where an un-partitioned `gps_ping` table with a spatial index on every row (current schema) starts to hurt: index maintenance cost on a monotonically growing, GiST-indexed table at this row count is a real risk to write latency. Partitioning by month becomes necessary, not optional, at this band.
- **1,000,000:** ~70M pings/day — single-primary Postgres is under real strain regardless of partitioning; this is the band where extracting a dedicated ingestion path for raw location data (still Postgres-compatible, e.g., TimescaleDB hypertables, or a columnar store for the append-only trajectory data) should be seriously evaluated. City-based sharding (already anticipated via `city_id`) becomes relevant here too, since multi-city expansion likely arrives before 1M single-city users does.

**Verdict: MODIFY.** Keep single Postgres as the MVP decision (correct), but revise the `gps_ping` table design now (see §15, §20, Improvement Report) rather than deferring the decision to "later" — the column/index choice made today determines how painful the partitioning migration is later.

---

## 3. Event Model

**Current design (ADR-0002, ADR-0008):** in-process domain event bus (Nest `EventEmitter`), `TripCompleted → Trust → TripVerified → Reward`, with a stated intention to swap for a real broker "if/when modules are extracted into services."

**Why it was chosen:** operational simplicity at MVP, no extra infrastructure (broker) to run.

**This is the most significant finding in this review.** An in-process `EventEmitter` has no durability: if the process crashes, is redeployed, or the handler throws, between the `Trip.complete()` DB commit and the event being consumed, **the event is gone**. Nothing re-fires it. The trip sits `COMPLETED` forever with no trust verdict, silently, because there's no dead-letter or retry mechanism for an in-memory emitter. This directly undermines the one guarantee the whole Trust/Reward design depends on: every completed trip gets evaluated.

**Alternatives:**
- (a) **Keep in-process emitter, add nothing** — rejected, the failure mode above is not hypothetical, it's the default behavior of `EventEmitter` under any deploy or crash.
- (b) **Jump straight to a message broker (Redis Streams/RabbitMQ) at Phase 3** — solves durability but adds operational surface (another system to run/monitor) before it's load-justified; the *volume* of trip-completion events at 100–10,000 users doesn't need a broker's throughput, only its durability guarantee.
- (c) **Transactional Outbox pattern**: write the domain event to an `outbox` table in the *same transaction* as the state change that produced it (e.g., `Trip.status = COMPLETED` and an `outbox` row insert commit atomically), then a relay process (can be as simple as a polling worker at MVP scale) reads unprocessed outbox rows and dispatches them — in-process at MVP, to a real broker later, without changing the write-side contract. **Recommended.**

**Trade-offs of (c):** slightly more write-path complexity (one extra insert per event, in the same transaction — cheap), a small relay/poller component to build and monitor, at-least-once delivery semantics requiring idempotent consumers (already partially true — `TripVerified` handling should be idempotent by trip ID, which is a good discipline regardless).

**Scale behavior:** durability matters identically at 100 users and 1,000,000 users — a dropped event is just as bad at small scale (worse, actually, since there's no volume to statistically hide the failure rate from a frustrated early user). What changes with scale is only the relay mechanism: a polling worker over the outbox table is fine through the 10,000–100,000 band; beyond that, replace the poller with a change-data-capture relay (e.g., Debezium) or a real broker consuming the outbox — but the **outbox table and event contract don't change**, only what drains it.

**Verdict: REDESIGN.** Adopt Transactional Outbox from Phase 3, not "later." See ADR-0011.

---

## 4. Trust Engine

**Current design:** independent module, reacts only to `TripCompleted`, composes weighted `TrustSignalEvaluator`s, publishes `TripVerified`/`TripRejected`/flags for review; Reward has no code path to bypass it (ADR-0008).

**Why:** structural fraud resistance (the compromise of one module can't mint rewards), independent evolvability of scoring logic, auditability via versioned thresholds (ADR-0010).

**Alternatives:** synchronous scoring inline in the Trip completion request (rejected — couples trip completion latency to scoring cost, and removes the architectural firewall that makes reward-granting structurally impossible without a trust pass); a fully external ML-based scoring service from day one (rejected as premature — no training data exists yet; the pluggable `TrustSignalEvaluator` pipeline already leaves room for a learned-model evaluator to be added as one more signal later without a redesign).

**Trade-offs:** eventual consistency between trip completion and reward grant (already documented, correct call) — but this trade-off's soundness is *conditional on event durability*, which is why §3's finding is upstream of this one: an isolated Trust Engine that never receives its trigger event is isolated from nothing useful.

**Scale behavior:**
- **100–10,000:** per-trip scoring (a handful of SQL aggregate queries over that trip's pings plus a route-deviation comparison against the stored route) is cheap; a single worker process consuming the outbox easily keeps up.
- **100,000:** several hundred trips/hour at peak needing scoring — still fine for synchronous-per-event processing, but this is the point to make sure scoring is a background worker pool, not something that could ever block the request path (already the design, just flagging it needs enforcing in code, not assumed).
- **1,000,000:** thousands of trips/hour; the *aggregate-behavior* signals (a rider generating implausibly many verified trips per day — Threat Model §3 point 3) need to run as a separate windowed/batch job over recent trust assessments rather than being recomputed per-trip from scratch, or that query becomes the bottleneck, not raw per-trip scoring.

**Verdict: KEEP** the design; its correctness depends on fixing §3 first.

---

## 5. Rewards Engine

**Current design:** append-only ledger, `points_balance` as a maintained projection, redemption requires `REGISTERED` rider, pluggable `RewardProvider` adapters.

**Why:** ledger-as-source-of-truth is the right pattern for anything resembling a balance (auditable, replayable, no destructive updates).

**Finding — concurrency control is unspecified.** Two concurrent redemption requests (double-tap, retried request, or a race between two devices on the same now-registered account) against the same wallet could both read `points_balance = 100`, both redeem a 100-point offer, and both succeed if the update isn't guarded. Nothing in the current schema or API spec prevents this. This is not a scale problem — it can happen at 100 users just as easily as at 1,000,000 — it's a missing invariant.

**Alternatives:** (a) optimistic concurrency via a version column on `reward_wallet`, checked-and-incremented on every ledger-affecting transaction; (b) pessimistic locking (`SELECT ... FOR UPDATE` on the wallet row inside the redemption transaction); (c) derive balance purely from `SUM(ledger entries)` computed transactionally inside the same serializable transaction as the new entry, with a `CHECK` that the resulting balance is non-negative, so no separate "balance" row can ever drift from the ledger. **(c) is recommended** — it removes an entire class of drift bugs (projection out of sync with ledger) at the cost of a `SUM` query per redemption, which is cheap given a per-rider ledger is small.

**Scale behavior:** identical concern at every band — this is a correctness bug waiting for concurrent load, and concurrent load (two requests for the same rider at the same moment) is actually *more* likely at low scale from client retry logic (impatient tapping, flaky mobile network triggering a client-side retry) than from genuine high-traffic contention. **Fix before Phase 2, not "when it becomes a problem."**

**Verdict: MODIFY.** See ADR-0016 and Database Schema update.

---

## 6. Advertising Engine

**Current design:** geofence/route/radius targeting, priority, budget, impression/click tracking; targeting evaluated against a trip's position.

**Why:** enterprise-grade targeting is a stated product requirement; PostGIS containment queries are the natural implementation.

**Finding — over-engineered for MVP demand-side reality, under-specified for the query pattern that will actually run.** Two separate issues:

1. **Over-engineered relative to merchant count.** Dayparting, priority ranking, and budget-pacing algorithms are full-featured ad-server concerns that only matter once there are *enough concurrently active campaigns competing for the same impression* to need arbitration. At MVP (a handful of pilot merchants), a much simpler rule — "serve the single best-matching active campaign for this location, ties broken by creation order" — delivers the same user-visible outcome with a fraction of the logic to build and test. The full priority/pacing engine should be built when there's a second or third merchant actually competing for the same geofence, not speculatively.
2. **Under-specified where it matters: call frequency.** The API spec (`GET /ads/serve`) doesn't say when it's called. If the mobile client calls it on every GPS ping (every 3–5s during live tracking), that's a full spatial-targeting evaluation at GPS-ping frequency — the same volume problem as §15/§20, but for a code path that also does business logic (budget decrement checks, impression writes), not just an insert.

**Alternatives for the query pattern:** throttle ad-serve evaluation to trip-lifecycle moments (trip start, periodic interval e.g. every 60–90 seconds or every N meters of displacement, and trip completion) rather than every raw ping; pre-filter candidate campaigns with a coarse spatial bucket (geohash or a materialized per-city grid of active campaign coverage, recomputed on campaign create/update, not per request) before running precise PostGIS containment on the (much smaller) candidate set.

**Scale behavior:**
- **100–1,000:** irrelevant either way — a handful of campaigns, a handful of trips, no query is expensive yet. This is exactly why the simpler ranking rule above is safe to ship first.
- **10,000–100,000:** if ad-serve is (wrongly) called per-ping, this becomes one of the hottest code paths in the system purely from tracking overhead, independent of campaign count. Fixing the call cadence at Phase 8 design time avoids ever hitting this.
- **1,000,000:** campaign count itself may also grow (more cities, more merchants); the coarse-bucket pre-filter matters at this band even with correct call cadence.

**Verdict: MODIFY.** Simplify v1 targeting-arbitration logic; fix call cadence and pre-filtering at design time, not as a post-launch scramble. See Improvement Report and ADR-0014.

---

## 7. Fare Estimation Engine

**Current design:** rule-based `FareEstimationStrategy` (base fare, per-km rate, time-of-day multipliers, waiting charge) against a versioned `FareRuleSet`; PRD lists "traffic" as an input.

**Finding — a promised input has no provider.** `01-prd.md` §7.1 explicitly lists "traffic" as a fare-estimation input, but the Provider Abstraction table in `02-architecture.md` §4 has no `TrafficProvider` port, and no module in the domain model or architecture C4 diagram computes or consumes live traffic data. This is a scope-integrity gap: either the PRD overpromises, or a port is missing.

**Alternatives:** (a) add a `TrafficProvider` port with an MVP adapter that's a static time-of-day multiplier (already partially captured by `time_of_day_multipliers` in `FareRuleSet` — meaning the "traffic" input the PRD describes is *actually already implemented*, just not named or abstracted as a distinct provider); (b) integrate live traffic data (self-hosted OSRM does not provide live traffic by default; would require a separate live-traffic data source, which reintroduces the pay-per-request risk the Cost Strategy is designed to avoid); (c) explicitly descope real-time traffic from MVP and rename the PRD input to "time-of-day profile" to match what's actually built.

**Recommendation: (a) + (c) combined** — formalize the existing time-of-day multiplier as the answer to "traffic" for MVP (no new infrastructure needed, closes the documentation gap), and explicitly note in the PRD that *live* traffic-responsive estimation is a post-MVP enhancement requiring a real `TrafficProvider` adapter, not a Phase 5 deliverable.

**Scale behavior:** not scale-sensitive — this is a correctness-of-scope issue, not a load issue. Worth fixing before Phase 5 implementation starts, so engineers don't have to guess what "traffic" means when they get there.

**Verdict: MODIFY** (documentation + a named, if initially trivial, provider abstraction). See ADR-0012.

---

## 8–10. Maps / Routing / Geocoding Abstraction

**Current design:** `MapProvider`/`RoutingProvider`/`GeocodingProvider` ports; MVP adapter = hosted OSRM/Nominatim instances; migration path to self-hosted per ADR-0005.

**Why:** avoids pay-per-request billing risk; provider abstraction makes the self-hosting migration an adapter swap.

**Finding — the *starting point* implied by ADR-0005/Deployment Strategy is heavier than MVP needs.** "Self-hostable" was correctly chosen as the long-term property, but the documents drift toward implying a production-grade self-hosted OSRM/Nominatim *cluster* should exist early ("self-hosted infrastructure... in `infra/docker` or `infra/k8s`"). At 100–1,000 users, running any dedicated cluster for routing/geocoding is over-engineering relative to actual query volume (tens to low hundreds of routing calls/day). A single small VM running OSRM + Nominatim against an Alexandria-only OSM extract is enough capacity for several orders of magnitude of growth before it needs to be a cluster.

**Alternatives:** fully hosted third-party routing (rejected — reintroduces pay-per-request risk, the exact thing ADR-0005 exists to avoid); a public OSRM demo server (rejected for anything beyond local prototyping — not production-safe, no SLA, explicitly disallowed by its own usage policy for production traffic).

**Scale behavior:**
- **100–10,000:** a single small self-hosted OSRM+Nominatim VM (Alexandria-only extract) comfortably serves this range. This should be the actual MVP target, not a "hosted instance" that then needs migrating — skip the interim hosted-instance step entirely and self-host from day one, since the extract is small and the operational cost is low. This *reverses* part of ADR-0005's implied sequencing (hosted-first, self-host-later) for the specific case where the self-hosted footprint is already cheap.
- **100,000:** query volume and concurrency justify moving from a single VM to a small routing/geocoding cluster (2–3 instances behind a load balancer) — still self-hosted, still one Alexandria extract.
- **1,000,000 / multi-city:** this is where regional instance selection becomes a real design question (§24) — which OSRM/Nominatim instance serves a request depends on `city_id`/geographic bounds, requiring a routing layer in front of the provider adapters, not just more capacity on one instance.

**Verdict: MODIFY the sequencing, not the abstraction.** Ports stay (ADR-0003 reaffirmed); skip the "hosted-first" interim step given how cheap a single-city self-hosted footprint is; make regional instance selection an explicit part of the `RoutingProvider`/`GeocodingProvider` contract (accept a `cityId`/bounds parameter, not just coordinates) from the start, so multi-city expansion doesn't require reshaping the interface later.

---

## 11. Authentication

**Current design:** OTP (phone), Google, Apple, guest-first, all behind `AuthenticationProvider` (ADR-0009).

**Finding — a real external constraint was missing from the reasoning, not from the outcome.** Apple's App Store Review Guidelines (4.8) require offering Sign in with Apple on iOS *if* the app offers any other third-party/social login (Google, in this case) — so Apple Sign-In here isn't just a nice-to-have alternative, it's a hard iOS launch requirement the moment Google Sign-In ships on iOS. The current design already includes Apple, so the *outcome* is correct, but the ADR should record *why* it's non-negotiable (so a future cost-cutting pass doesn't drop it thinking it's optional polish).

**Alternatives considered:** OTP-only at MVP (simpler, avoids the Apple-mandatory coupling entirely) — viable if Google Sign-In is deferred; rejected as the primary MVP path only because social login materially reduces registration friction for the reward-redemption moment, which is a real conversion lever.

**Scale behavior:** not scale-sensitive; this is a policy-compliance fact, true at any user count. What *is* scale-sensitive is OTP delivery cost and abuse: SMS OTP has a real per-message cost and is a toll-fraud/spam target (Threat Model). At 1,000,000 users this cost is nontrivial and worth revisiting (e.g., WhatsApp OTP delivery, which is common and cheaper in Egypt, as an additional `AuthenticationProvider` adapter) — but this is additive, not a redesign, thanks to ADR-0003.

**Verdict: KEEP**, with the Apple-mandatory rationale made explicit (ADR update, not a new one — amend ADR-0009).

---

## 12–14. Guest Mode, Anonymous Users, Reward Migration After Registration

**Current design:** `device_anon_id`-keyed `GUEST` rider, promoted in place to `REGISTERED` preserving `RiderId` (ADR-0009, Domain Model §2).

**Why:** zero-friction first use; no risky dual-record merge.

**Finding 1 — reinstall-based reward farming is a real, currently under-mitigated fraud vector specific to this design.** Because guest identity lives entirely in device-local secure storage, uninstalling and reinstalling the app (or clearing app data) mints a brand-new `device_anon_id` and therefore a brand-new `GUEST` rider with a fresh reward-eligibility slate. Combined with the Trust Engine's per-trip (not strongly per-identity) verification, a single physical device could in principle farm verified-trip rewards repeatedly via reinstalls. The Threat Model addresses *device farms* (many devices) but not *this* specific single-device-reinstall vector.

**Alternatives:** (a) hardware attestation (Play Integrity API / App Attest) as a required signal specifically gating *guest-identity reward accrual* (not gating guest usage itself — estimation/tracking stay frictionless) — flags devices with a suspicious reinstall/reset cadence; (b) tie a secondary device fingerprint (not just the app-generated UUID) into the trust/fraud aggregate-behavior signal so reinstall doesn't fully reset the fraud history; (c) accept the risk and rate-limit reward *value* low enough that farming isn't worth the effort at MVP — reasonable as a short-term stance, but should be a stated decision, not an oversight.

**Recommendation:** ship MVP with (c) as the explicit accepted risk (cap early reward value, monitor abuse rate), and add (a) as a Phase 6 hardening item once real abuse data exists to justify the added complexity — but the *decision to accept the risk* should be written down now, not discovered later when someone asks "wait, couldn't they just reinstall?"

**Finding 2 — registration identity-merge conflict policy is unspecified.** The design correctly handles the common case (a device's own `GUEST` rider is promoted to `REGISTERED`). It does not specify what happens when a phone number used for OTP verification is already linked to a *different, existing* `REGISTERED` rider (e.g., a resold or shared device: Device A has guest history, but the phone number being OTP-verified already belongs to Account B). Silently merging Device A's guest history into Account B would let anyone with a device farm reachable to a real phone number inject fabricated trip/reward history into an unrelated account — a second reward-fraud vector hiding inside the "convenient" merge behavior.

**Recommendation:** the rule must be explicit: **guest-history merge only happens when the device's local rider is still `GUEST` at the moment of *that device's own* first registration.** If the OTP/Google/Apple identity being verified already belongs to an existing `REGISTERED` rider, the device's prior `GUEST` history is **not** merged — the user is simply logged into their existing account, and the device's now-orphaned guest history is left un-migrated (acceptable loss; it was never guaranteed to survive a device change per the already-accepted limitation in ADR-0009).

**Scale behavior:** both findings are fraud-economics questions, not load questions — they matter *more*, not differently, as reward value/user count grows, since farming payoff scales with the platform's redemption value. Fix the *policy* now (cheap, it's a rule in the promotion use case); defer the *hardware-attestation enforcement* (Finding 1's option a) until warranted by real abuse telemetry.

**Verdict: MODIFY** — write down the accepted-risk decision and the merge-conflict rule explicitly; no schema change required (Domain Model's `RiderId`-preserving promotion already supports the correct rule, it just needs to be stated).

---

## 15. GPS Tracking

**Current design:** `trip.gps_ping` as a child table of `Trip`, GiST-indexed on `location`, one row per ping.

**Finding — the spatial index is on the wrong thing, and the real scale risk (row volume) wasn't addressed at the schema level.** No query in the domain model does spatial *containment* search over individual pings (e.g., "find all pings within polygon X") — the Trust Engine and live-tracking reads are fundamentally **per-trip, time-ordered** access patterns (`WHERE trip_id = ? ORDER BY recorded_at`). A GiST index on `location` costs write overhead on every insert and disk space, for a query pattern that will essentially never use it. What *is* missing is an explicit plan for the composite `(trip_id, recorded_at)` access path (a plain B-tree, already implied but should be primary, not secondary) and a firm partitioning decision (monthly range partitions on `recorded_at`) made at schema-design time rather than "later," since retrofitting partitioning onto a live, growing table is significantly more disruptive than designing it in from the first migration.

**Alternatives:** keep pings in Postgres but partitioned from day one (recommended, lowest operational complexity, stays in the one-datastore MVP decision); move raw pings to a specialized time-series/columnar store (Timescale, ClickHouse) immediately — rejected as premature relative to §2's operational-simplicity trade-off, revisit only at the 100,000+ band if partitioned Postgres genuinely can't keep up.

**Client-side finding:** GPS `recorded_at` is client-supplied. A client can misreport timestamps to manipulate speed/plausibility signals. The backend should additionally stamp `received_at` (server clock) on ingestion and treat large discrepancies between inferred client-timestamp deltas and server-arrival deltas as a trust signal input, not blindly trust `recorded_at` alone.

**Scale behavior:** see Database Design §2 scale table — this table is the single highest-volume table in the system at every band, and the one where a wrong early decision compounds fastest.

**Verdict: REDESIGN** the table's indexing/partitioning plan now. See ADR-0015 and Database Schema update.

---

## 16–17. Offline Behavior & Sync Strategy

**Current design:** client buffers GPS pings locally when offline, batches on reconnect; server accepts batched ping arrays.

**Why:** trips must survive brief connectivity loss without losing continuity, a real condition in parts of Alexandria.

**Finding — burst ingestion and out-of-order/duplicate handling aren't fully specified.** A batch flush after an extended offline period could submit hundreds of pings in one request; the ingestion endpoint needs an explicit per-request cap (reject/chunk oversized batches) and idempotency (a retried flush after a flaky ack shouldn't double-insert pings) — currently implied but not stated as a hard contract in the API spec.

**Alternatives:** client-side dedup keys (a client-generated ping ID) enabling `INSERT ... ON CONFLICT DO NOTHING` idempotency at the DB level — cheap and effective, recommended.

**Scale behavior:** per-trip, so this doesn't get worse with *user count* directly, but it does get worse with *poor-connectivity-area density* — worth explicit load testing (Testing Strategy §6) simulating realistic offline-buffer burst sizes, not just steady-state ping rate.

**Verdict: MODIFY** — add explicit batch-size cap and idempotency key to the API spec; no architectural change needed.

---

## 18. Configuration Management

**Current design:** versioned, append-only `FareRuleSet`/`TrustThresholdConfig`/`RewardRuleConfig`, admin-editable, "resolve latest effective version" read pattern; Scalability Plan mentions caching "current effective version" in Redis.

**Finding — cache invalidation across horizontally-scaled instances is unaddressed.** The moment there's more than one backend instance (which is the entire point of the stateless-horizontal-scaling design in §2 of the Scalability Plan), each instance's local/Redis-read cache of "current effective config" must be invalidated consistently when an admin publishes a new config version. If invalidation isn't broadcast (e.g., via Redis pub/sub or a short TTL), different instances can serve different fare rules or trust thresholds to different requests for a stale window — a correctness bug that's invisible at one instance and real the moment there are two.

**Alternatives:** short TTL cache (simple, small staleness window, no pub/sub needed) — acceptable given config changes are infrequent (admin-driven) and a few seconds of staleness is tolerable for fare rules; explicit pub/sub invalidation (more precise, more moving parts) — worth it only if even few-second staleness on trust-threshold changes is judged unacceptable (e.g., an emergency threshold tightening in response to an active fraud attack, where a few seconds matters).

**Recommendation:** short TTL cache (10–30s) as the MVP default, since it's simple and correct-enough; add pub/sub invalidation specifically for `TrustThresholdConfig` (the one config type where staleness during an active-incident response is actually costly) if/when that scenario is judged worth the complexity.

**Scale behavior:** the bug is dormant at 1 instance (100–1,000 users, likely single instance) and becomes live the moment a second instance exists — likely around the 10,000 band per the Scalability Plan's own capacity milestones. Must be decided before that point, not discovered at it.

**Verdict: MODIFY.** See ADR-0013.

---

## 19. Feature Flags

**Current design:** `config.feature_flag` — a flat boolean per key, no per-city or percentage-rollout targeting.

**Why:** simplest thing that works for a single-city MVP with a small admin team making manual on/off calls.

**Alternatives:** percentage-rollout/cohort-targeted flags (LaunchDarkly-style) — rejected as over-engineering for MVP; a flat boolean is genuinely sufficient until there are multiple cities or a need for gradual rollout of risky changes (e.g., a new Trust signal) to a subset of traffic.

**Scale behavior:** stays adequate through the 10,000 band. At 100,000+ and/or multi-city, a flat global boolean stops being sufficient — you'll want to roll out a new Trust signal to Alexandria only, or to 5% of trips, before trusting it platform-wide. This is a natural Phase-10-or-later enhancement, correctly *not* built now.

**Verdict: KEEP as-is for MVP.** Explicitly note in the Roadmap that per-city/percentage targeting is a deferred, not forgotten, enhancement (already implicitly true; make it explicit).

---

## 20. Performance Bottlenecks

Consolidated from findings above, ranked by when they bite:

| Bottleneck | First bites at | Root cause | Fix |
|---|---|---|---|
| Dropped domain events | Any scale (correctness bug, not load bug) | In-process `EventEmitter`, no durability | Transactional Outbox (§3, ADR-0011) |
| Reward wallet race condition | Any scale (client retry more likely trigger than raw traffic) | No concurrency control on wallet writes | Ledger-derived balance in a single transaction (§5, ADR-0016) |
| Config cache staleness across instances | ~10,000 MAU (first horizontally-scaled deploy) | No cache-invalidation broadcast | TTL cache + pub/sub for trust config (§18, ADR-0013) |
| In-memory rate limiting under-counting abuse | ~10,000 MAU (first horizontally-scaled deploy) | Per-instance limiter, not shared | Redis-backed distributed rate limiter (§21, ADR-0013) |
| `gps_ping` write/index cost | ~100,000 MAU | Unpartitioned table, unnecessary per-row GiST index | Partition by month, drop spatial index on raw pings (§15, ADR-0015) |
| Ad-targeting evaluation cost | ~10,000–100,000 MAU, sooner if called per-ping | Unthrottled call cadence + no spatial pre-filter | Throttled cadence + coarse pre-filter (§6, ADR-0014) |
| Single Postgres primary as global ceiling | ~100,000–1,000,000 MAU | Single-instance write path | Read replicas (already planned) → city sharding (already anticipated via `city_id`) |

**Verdict:** the *scale-linked* bottlenecks were already reasonably anticipated in the Scalability Plan. The *correctness-linked* ones (event durability, wallet concurrency) were not properly separated from "scale" concerns and were at risk of being deprioritized as "Phase 10 optimization" when they're actually "fix before Phase 3" issues.

---

## 21–22. Security & Fraud Vectors

Covered in depth in `09-security-model.md` and `10-threat-model.md`; this review adds three items not previously captured:

1. **Distributed rate limiting** (see §20) is a security control, not just a performance one — an in-memory-only limiter effectively multiplies the abuse ceiling by instance count, silently weakening OTP-spam and fake-trip-generation defenses exactly when the platform scales enough to need them most.
2. **Reinstall-based guest reward farming** (§12–14 Finding 1) and **cross-account guest-merge injection** (§12–14 Finding 2) are two concrete fraud vectors specific to this platform's guest-identity design that weren't previously named at this level of precision, even though the general "device farm" and "duplicate rider" categories existed in the Threat Model.
3. **Client-supplied GPS timestamps** (§15) as an unaddressed manipulation surface for trust scoring — the fix (server-side `received_at` stamping and cross-checking) is cheap and should be in the GPS ingestion contract from the start, not retrofitted after a fraud pattern is observed.

**Verdict: MODIFY** Threat Model and Security Model with these three additions (applied directly, see file updates).

---

## 23. Future AI Integration

**Current design:** `FareEstimationStrategy` is already a swappable strategy interface (rule-based today, ML-based later); Scalability Plan §7 already specifies analytical workloads run against replicas/derived tables, not raw operational tables.

**Finding — this is one of the better-anticipated areas, with one refinement.** Raw `gps_ping` rows are not, by themselves, good ML training input — they need to be reduced to per-trip feature vectors (distance, duration, average/max speed, stop count, route-deviation statistics, time-of-day, day-of-week) before they're useful for fare-prediction or fraud-model training. The Trust Engine already computes most of these as part of scoring (§4) — the refinement is to **persist them as a first-class `trip_feature_snapshot` alongside the `TripTrustAssessment`**, rather than requiring a future ML pipeline to recompute them from raw pings after the fact. This turns "ML-ready" from an aspiration into a concrete table that exists from Phase 6 onward.

**Scale behavior:** the earlier this feature-snapshot table exists, the more historical training data accumulates before a model is ever trained — there's a real cost to *not* doing this early, since feature history can't be manufactured retroactively with full fidelity if raw-ping retention windows (Security Model §4) have already pruned the source data by the time someone wants to train a model.

**Verdict: MODIFY (addition, not correction).** Add `trust.trip_feature_snapshot` to the schema, populated by the Trust Engine at scoring time. See Database Schema update.

---

## 24. Future Expansion to Other Egyptian Cities

**Current design:** `city_id` scopes config, trips, campaigns; Scalability Plan §6 covers onboarding steps.

**Finding — the Maps/Routing/Geocoding provider contract doesn't yet carry city/region context.** As noted in §8–10, ports currently take coordinates but not an explicit `cityId`/region parameter, meaning multi-instance regional routing (Cairo's OSRM instance vs. Alexandria's) would require a provider-interface change at expansion time rather than being supported by the interface from day one. Cheap to fix now (add the parameter, MVP adapter ignores it and always points at the one Alexandria instance), expensive to retrofit later (every call site would need updating).

**Verdict: MODIFY.** Add `cityId`/region to the `RoutingProvider`/`GeocodingProvider`/`MapProvider` port signatures now, even though the MVP adapter only ever serves one region.

---

## Summary Verdict Table

| # | Subsystem | Verdict |
|---|---|---|
| 1 | Domain boundaries | Keep (fix doc drift) |
| 2 | Database design | Modify (gps_ping design) |
| 3 | Event model | **Redesign** (outbox) |
| 4 | Trust Engine | Keep (depends on #3) |
| 5 | Rewards Engine | Modify (wallet concurrency) |
| 6 | Advertising Engine | Modify (simplify + cadence) |
| 7 | Fare Estimation | Modify (traffic scope) |
| 8–10 | Maps/Routing/Geocoding | Modify (sequencing + region param) |
| 11 | Authentication | Keep (clarify Apple rationale) |
| 12–14 | Guest/Anonymous/Migration | Modify (state accepted risk + merge rule) |
| 15 | GPS Tracking | **Redesign** (indexing/partitioning) |
| 16–17 | Offline/Sync | Modify (batch cap + idempotency) |
| 18 | Configuration | Modify (cache invalidation) |
| 19 | Feature Flags | Keep as-is for MVP |
| 20 | Performance | Modify (prioritization, see table) |
| 21–22 | Security/Fraud | Modify (3 additions) |
| 23 | Future AI | Modify (feature-snapshot table) |
| 24 | Multi-city | Modify (provider signature) |

**Over-engineered (relative to MVP need):** enterprise ad-serving arbitration logic (priority/pacing) before real merchant demand exists (§6); implied "hosted-first, self-host-later" sequencing for routing/geocoding when a self-hosted single-VM footprint is already cheap enough to be the actual MVP starting point (§8–10).

**Under-engineered (relative to correctness need):** event delivery durability (§3); reward wallet concurrency (§5); distributed rate limiting and config cache invalidation (§18, §20); GPS ping table partitioning/indexing plan (§15); the missing `TrafficProvider`/traffic scope clarity (§7); the two guest-identity fraud vectors (§12–14).

**Should be simplified:** Advertising Engine v1 targeting-arbitration (§6).

**Should be redesigned before any code is written:** the event model (§3) and the `gps_ping` schema (§15) — both because they get materially more expensive to change once real data/traffic exists against the old shape, unlike the other findings, which are safe to fix incrementally in Phase 2–3.
