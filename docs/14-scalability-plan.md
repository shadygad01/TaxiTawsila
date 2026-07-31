# Scalability Plan

**Status:** Draft v1.0 — Phase 1

## 1. Scaling Dimensions

The platform must scale along three independent axes: **request volume** (more riders in Alexandria), **geographic expansion** (more Egyptian cities), and **data volume** (accumulated trip history for the data platform / future ML).

## 2. Application Tier

- Backend is stateless (JWT-based auth, no server-side session affinity) — horizontally scalable by adding instances behind a load balancer, no code changes required.
- Modular monolith (ADR-0002) scales as one unit at MVP; if one module (most likely Trust Engine or Data Quality Engine, given compute-heavy scoring, or Advertising, given targeting-query load) becomes a bottleneck, it is extracted into its own service using the already-enforced module boundary (ADR-0008/ADR-0019) — scale the hot module independently rather than the whole monolith.
- CPU-heavy work (Trust batch scoring, Data Quality scoring, campaign-targeting evaluation over many active campaigns) offloaded to background workers via a queue (Redis/BullMQ) rather than blocking request-handling instances.
- **Data Quality as a second parallel outbox consumer (added, ADR-0019):** `TripCompleted` now fans out to two independent worker pools (Trust, Data Quality) rather than one. Each scales independently — Data Quality's per-trip scoring cost is comparable to Trust's (a handful of aggregate queries plus route-deviation comparison), so the same capacity milestones from Trust Engine's scale story (Architecture Review §4) apply: comfortable through the 100,000 MAU band as a background worker pool, revisit only if trip volume and threshold-checking complexity grow together.
- **Feature Management resolution must be cheap on the hot path (added, ADR-0018):** flag/segment/experiment resolution goes through the same Redis-backed short-TTL cache as Configuration Platform reads (ADR-0013) — never a per-request database round-trip. Kill-switch flags are the one exception requiring pub/sub invalidation instead of TTL, precisely because their whole purpose is sub-TTL response time during an incident.

## 3. Database Tier

- **Read replicas**: read-heavy paths (admin analytics/reports, trip history listing, ad-targeting lookups) directed to read replicas, keeping the primary free for write-heavy trip/GPS/ledger paths.
- **Partitioning**: `trip.gps_ping` is monthly-range-partitioned on `recorded_at` **from the first migration**, not "once volume warrants" — this was revised on architecture review (ADR-0015) because retrofitting partitioning onto a populated, growing table is materially more disruptive than designing it in from the start. `trip.trip` remains partition-ready (`city_id`, `created_at`) but doesn't need day-one partitioning at MVP volume.
- **City-based sharding (future)**: `city_id` is present on every relevant table specifically so that, if a single Postgres instance can no longer serve all cities, data can be sharded by city without a schema redesign — a later-stage option, not an MVP requirement.
- **Connection pooling**: PgBouncer (or equivalent) in front of Postgres from day one to avoid connection exhaustion as instance count grows.
- **Append-only ledger tables** (`reward_ledger_entry`, `gps_ping`, `audit_log_entry`) avoid update-heavy hot rows, keeping write amplification and lock contention low as volume grows.

## 4. Caching

- Redis caches: fare-rule/trust-config/reward-config "current effective version" lookups (avoid resolving versioned config on every request), frequent geocoding results (bounded by cache-invalidation policy on OSM data refresh), active-campaign targeting index (recomputed on campaign change, not per-request).
- HTTP-level caching for public, slowly-changing endpoints (`/config/cities`, `/config/feature-flags`).

## 5. Geospatial Query Performance

- GiST indexes on every geometry column used in hot paths (`trip.origin`/`destination`/`route`, `advertising.geofence.area`) — verified via `EXPLAIN ANALYZE` as part of the integration test suite for any new geospatial query. `gps_ping.location` deliberately has **no** spatial index (ADR-0015) since nothing queries it spatially; indexing it would only add write cost.
- **Campaign-targeting evaluation and call cadence (revised, ADR-0014):** ad-serve is evaluated at trip-lifecycle moments (start, ~60–90s/displacement-threshold intervals, completion) — never per raw GPS ping — with a coarse spatial pre-filter (geohash/grid bucket, recomputed on campaign change) narrowing candidates before precise PostGIS containment. Getting the call cadence right at design time avoids this becoming the hottest path in the system purely from tracking overhead, independent of campaign count.

## 6. Multi-City Expansion

- `City` is a first-class config entity (Architecture §10); onboarding a new city is: insert a `City` row + bounds, insert an initial `FareRuleSet`/`TrustThresholdConfig`/`RewardRuleConfig` version, ensure OSM/OSRM/Nominatim regional coverage — no code changes.
- Regional OSRM/Nominatim self-hosted instances can be deployed per-region if a single national instance becomes a routing-latency bottleneck (Deployment Strategy §5 self-hosting path already anticipates per-region infra).

## 7. Data Platform / ML Readiness at Scale

- Analytical workloads (future ML feature extraction, reporting) run against read replicas or a dedicated analytical schema/warehouse export, never against the primary transactional path — protects trip/trust/reward write latency from analytics load.
- As trip volume grows, a periodic ETL/export job (Phase 10+) materializes ML-ready feature tables (e.g., aggregated by route/time-of-day/city) rather than every training run scanning raw `gps_ping`.

## 8. Capacity Milestones (indicative, refined with real traffic data)

| Milestone | Expected Trigger | Action |
|---|---|---|
| Single-city MVP launch | N/A | Single Postgres primary + 1 replica, single backend cluster, hosted OSRM/Nominatim |
| Growth within Alexandria | Sustained DB write latency degradation or replica lag | Add partitioning to `trip`/`gps_ping`; add PgBouncer if not already present |
| Second city onboarding | Product decision to expand | Verify OSM/OSRM/Nominatim coverage; no schema change needed (`city_id` already scoping) |
| Trust Engine becomes compute bottleneck | Scoring latency/backlog growth | Extract Trust module into its own service per ADR-0008 |
| National multi-city scale | Sustained multi-region load | Evaluate city-based sharding; consider self-hosted OSRM/Nominatim per region |

## 9. Non-Functional Targets (initial, revisited post-launch with real data)

- API p95 latency: < 300ms for fare estimate, < 200ms for live-tracking snapshot.
- GPS ping ingestion: support batched pings at typical mobile-network intervals without backend queueing delay under normal load.
- Trust Engine: verdict available within a few seconds of `TripCompleted` under normal load (eventual consistency is acceptable per ADR-0008, but should not feel broken to users).
