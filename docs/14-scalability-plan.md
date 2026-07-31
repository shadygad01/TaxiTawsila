# Scalability Plan

**Status:** Draft v1.0 — Phase 1

## 1. Scaling Dimensions

The platform must scale along three independent axes: **request volume** (more riders in Alexandria), **geographic expansion** (more Egyptian cities), and **data volume** (accumulated trip history for the data platform / future ML).

## 2. Application Tier

- Backend is stateless (JWT-based auth, no server-side session affinity) — horizontally scalable by adding instances behind a load balancer, no code changes required.
- Modular monolith (ADR-0002) scales as one unit at MVP; if one module (most likely Trust Engine, given compute-heavy scoring, or Advertising, given targeting-query load) becomes a bottleneck, it is extracted into its own service using the already-enforced module boundary (ADR-0008) — scale the hot module independently rather than the whole monolith.
- CPU-heavy work (Trust batch scoring, campaign-targeting evaluation over many active campaigns) offloaded to background workers via a queue (Redis/BullMQ) rather than blocking request-handling instances.

## 3. Database Tier

- **Read replicas**: read-heavy paths (admin analytics/reports, trip history listing, ad-targeting lookups) directed to read replicas, keeping the primary free for write-heavy trip/GPS/ledger paths.
- **Partitioning**: `trip.gps_ping` and `trip.trip` are natural candidates for range partitioning by month (`recorded_at`/`created_at`) once volume warrants — keeps indexes small and vacuum/maintenance cheap; schema already designed partition-ready (Database Schema §9).
- **City-based sharding (future)**: `city_id` is present on every relevant table specifically so that, if a single Postgres instance can no longer serve all cities, data can be sharded by city without a schema redesign — a later-stage option, not an MVP requirement.
- **Connection pooling**: PgBouncer (or equivalent) in front of Postgres from day one to avoid connection exhaustion as instance count grows.
- **Append-only ledger tables** (`reward_ledger_entry`, `gps_ping`, `audit_log_entry`) avoid update-heavy hot rows, keeping write amplification and lock contention low as volume grows.

## 4. Caching

- Redis caches: fare-rule/trust-config/reward-config "current effective version" lookups (avoid resolving versioned config on every request), frequent geocoding results (bounded by cache-invalidation policy on OSM data refresh), active-campaign targeting index (recomputed on campaign change, not per-request).
- HTTP-level caching for public, slowly-changing endpoints (`/config/cities`, `/config/feature-flags`).

## 5. Geospatial Query Performance

- GiST indexes on every geometry column used in hot paths (`trip.origin`/`destination`/`route`, `advertising.geofence.area`) — verified via `EXPLAIN ANALYZE` as part of the integration test suite for any new geospatial query.
- Campaign-targeting evaluation (matching a live trip position against many active geofences) is the platform's highest-cardinality spatial query; if candidate-campaign count grows large per city, pre-filter using a coarse spatial index (e.g., geohash bucket) before the precise PostGIS containment check.

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
