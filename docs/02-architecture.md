# System Architecture

**Status:** v1.1 — extended with the Data Quality, Feature Management, Configuration, and Fare Policy platforms before Phase 2. See `18-platform-extensions.md` for the full design reasoning; this document reflects the resulting state.

## 1. Architectural Style

**Modular monolith backend, provider-abstracted, event-informed.**

Rationale: at MVP scale, a distributed microservices architecture adds operational cost (deployment, observability, network reliability) without a corresponding benefit — team size and traffic do not yet justify it. Instead, the backend is built as a **single deployable NestJS application composed of strictly isolated modules**, each owning its own domain, database schema (via Postgres schemas), and public interface. Modules communicate only through explicit application-service interfaces or an internal event bus — never through shared tables or reaching into another module's internals.

This gives us:
- One deployment unit to operate at MVP scale (low ops cost).
- A **seam already in place** to extract any module (e.g., Trust Engine, Advertising Engine) into its own service later, because module boundaries are enforced from day one, not retrofitted.
- Clear ownership boundaries mapped 1:1 to bounded contexts (see Domain Model).

See ADR-0002 (Modular Monolith) and ADR-0008 (Trust Engine Isolation).

## 2. C4 — System Context

```mermaid
flowchart TB
    subgraph Users
        Guest[Guest Passenger]
        Reg[Registered Passenger]
        Admin[Platform Admin / Ops]
        Merchant[Merchant / Advertiser]
    end

    Mobile[Flutter Mobile App]
    AdminWeb[React Admin Dashboard]
    API[NestJS Backend API]

    subgraph External Providers - abstracted
        Map[Map / Tile Provider]
        Routing[Routing Provider - OSRM]
        Geocode[Geocoding Provider - Nominatim]
        Push[Push Notification Provider - FCM]
        AuthP[Identity Providers - Google/Apple/OTP-SMS]
    end

    DB[(PostgreSQL + PostGIS)]
    Cache[(Redis Cache/Queue)]
    Storage[(Object Storage)]

    Guest --> Mobile
    Reg --> Mobile
    Admin --> AdminWeb
    Merchant --> AdminWeb

    Mobile --> API
    AdminWeb --> API

    API --> DB
    API --> Cache
    API --> Storage
    API -.abstracted via Provider Interfaces.-> Map
    API -.-> Routing
    API -.-> Geocode
    API -.-> Push
    API -.-> AuthP
```

## 3. C4 — Container / Module View (Backend)

```mermaid
flowchart TB
    subgraph "NestJS Backend (single deployable)"
        Gateway[API Gateway Layer<br/>REST controllers, DTO validation, versioning]

        subgraph Core Platform
            AuthMod[Identity & Auth Module]
            ConfigMod["Configuration Module<br/>(GPS/Fraud/RateLimit/AdTarget/<br/>DataQuality thresholds - NEW)"]
            FeatureMod["Feature Management Module (NEW)<br/>toggles, rollouts, kill switches,<br/>segments, experiments"]
            PermMod[Permissions/RBAC Module]
            LogMod[Logging & Audit Module]
            MonMod[Monitoring/Health Module]
        end

        subgraph Maps Platform
            MapAbstraction[Map/Routing/Geocoding/Traffic<br/>Provider Abstraction]
        end

        subgraph Trip Platform
            TripMod["Trip Module - single public interface;<br/>GPS/Fare-orchestration/History are internal<br/>services, not sibling modules<br/>(see Architecture Review item 1)"]
        end

        subgraph "Fare Policy Platform (NEW)"
            FarePolicyMod["Fare Policy Engine Module<br/>(ADR-0021): owns fare business rules,<br/>consumed synchronously by Trip"]
        end

        subgraph Trust Platform
            TrustMod[Trust Engine Module<br/>independently deployable-ready]
            FraudMod[Fraud/Anomaly Detection]
        end

        subgraph "Data Quality Platform (NEW)"
            DataQualityMod["Data Quality Engine Module (ADR-0019)<br/>independent of Trust; owns readiness_status"]
            ReviewMod["Manual Review Queue (ADR-0020)"]
        end

        subgraph Rewards Platform
            RewardMod[Reward Engine Module]
            WalletMod[Points/Wallet Module]
            CouponMod[Reward Provider Adapters]
        end

        subgraph Advertising Platform
            AdMod[Campaign/Geofencing Module]
            AdAnalytics[Ad Analytics Module]
        end

        subgraph Admin Platform
            AdminAPI[Admin API Module]
        end

        EventBus[["Transactional Outbox + Relay<br/>(ADR-0011)"]]
    end

    Gateway --> AuthMod
    Gateway --> TripMod
    Gateway --> AdminAPI
    Gateway -- "resolve flags/experiments" --> FeatureMod

    TripMod --> MapAbstraction
    TripMod -- "resolveActivePolicy (sync call)" --> FarePolicyMod
    TripMod -- "TripCompleted (via Outbox)" --> EventBus
    EventBus --> TrustMod
    EventBus --> DataQualityMod
    TrustMod -- "TripVerified/TripRejected (via Outbox)" --> EventBus
    EventBus --> RewardMod
    EventBus --> DataQualityMod
    TrustMod --> FraudMod
    DataQualityMod --> ReviewMod
    RewardMod --> WalletMod
    RewardMod --> CouponMod
    AdMod --> AdAnalytics
    AdminAPI --> TripMod
    AdminAPI --> TrustMod
    AdminAPI --> DataQualityMod
    AdminAPI --> ReviewMod
    AdminAPI --> RewardMod
    AdminAPI --> AdMod
    AdminAPI --> FarePolicyMod
    AdminAPI --> FeatureMod
    AdminAPI --> ConfigMod
    AdminAPI --> LogMod
    AdminAPI --> MonMod
```

## 4. Provider Abstraction Layer

**No business logic may directly depend on a third-party SDK or API.** Every external capability is accessed through a domain-owned interface (a "Port" in hexagonal-architecture terms), with one or more swappable "Adapters."

| Port (interface, owned by domain) | MVP Adapter | Future/Alt Adapter |
|---|---|---|
| `MapProvider` | MapLibre/Leaflet + OSM tiles | Self-hosted tile server |
| `RoutingProvider` | Self-hosted OSRM (single small VM, Alexandria-only extract — see ADR-0005 sequencing revision) | Self-hosted OSRM cluster, multi-region, **with a configured fallback instance** (added, Pre-Implementation Audit §9 — a single-instance outage was previously a total fare-estimation outage; the port supports an ordered adapter fallback list, not just a single active adapter) |
| `GeocodingProvider` | Self-hosted Nominatim (single small VM, Alexandria-only extract) | Self-hosted Nominatim cluster, multi-region, same fallback-list support |
| `NotificationProvider` | Firebase Cloud Messaging | Self-hosted push (UnifiedPush) / APNs direct |
| `StorageProvider` | S3-compatible object storage | Self-hosted MinIO |
| `AuthenticationProvider` | OTP via SMS gateway, Google, Apple | Additional OIDC providers, WhatsApp OTP |
| `AnalyticsProvider` | Internal analytics module | Self-hosted (Plausible/Matomo) or external |
| `RewardProvider` | Internal coupon engine | Third-party loyalty/merchant APIs |
| `AdProvider`/`Ad Serving` | Internal campaign engine | N/A (always first-party — core IP; this is a deliberate stance, not a gap — see Pre-Implementation Audit §9: "multiple advertisement providers" is satisfied by multiple *merchants*, not multiple competing ad-serving engines) |
| `TrafficProvider` *(added on architecture review, ADR-0012)* | Static time-of-day/day-of-week multiplier read from `FareRuleSet` | Historical-speed-derived or live-traffic adapter, post-MVP |
| `DeviceAttestationProvider` *(added, Pre-Implementation Audit §5, ADR-0028)* | None at MVP (no adapter required to exist yet) | Play Integrity (Android), App Attest (iOS) — reserved as a Port now so a future anti-farming attestation signal is an adapter addition, not a violation of this table's own principle |

Each Port is defined as a TypeScript interface (backend) or abstract class (Flutter) in a **shared contracts package**, with the concrete adapter injected via dependency injection / service locator at the composition root. Swapping a provider means writing a new adapter class and changing one DI binding — zero changes to domain/business logic. See ADR-0003.

**Region-awareness (added on architecture review, Improvement Report A5):** `MapProvider`/`RoutingProvider`/`GeocodingProvider` method signatures accept an explicit `cityId`/region parameter from the start, even though the MVP adapter ignores it and always targets the single Alexandria instance. This avoids a call-site-wide interface change when a second city's regional instance is introduced.

**Future Public API (added, Pre-Implementation Audit §1/§9):** no bounded context, client-credential model, or distinct rate-limiting/versioning posture exists yet for non-mobile, non-admin API consumers (partners, researchers, government), despite this being a named future requirement (PRD §10). This is explicitly reserved, not built: a future `PublicApiContext` would sit alongside Administration as a composition layer exposing a deliberately narrower, versioned-independently subset of the platform's capabilities behind API-key/OAuth2-client-credential auth, with its own `RateLimitConfig` scope. Tracked in the Roadmap's Post-MVP Horizon; called out here so Phase 2 scaffolding doesn't need to guess whether it was overlooked.

## 5. Frontend Architecture

### 5.1 Mobile App (Flutter)
- **Clean Architecture** layering: `presentation` (widgets, state via Riverpod/Bloc) → `domain` (use cases, entities, repository interfaces) → `data` (repository implementations, API clients, local cache).
- Map rendering via `flutter_map` (MapLibre-compatible), never directly coupled to a specific tile vendor.
- Offline-tolerant GPS buffering: trip GPS pings are queued locally and flushed to the backend, so brief connectivity loss doesn't lose trip continuity.
- Guest identity: a durable **device-bound anonymous ID** (UUID persisted in secure local storage) is created on first launch, and is the join-key for trips/points until the user registers, at which point anonymous history is merged into the account (see Domain Model, Identity Context).

### 5.2 Admin Dashboard (React)
- Standard layered SPA: `pages` → `features` (per admin domain: users, trips, rewards, merchants, campaigns) → `shared` (API client, design system components).
- Data-grid heavy; server-driven pagination/filtering against the Admin API module.
- Heatmaps and analytics rendered client-side from aggregated backend endpoints (no raw PII trip data shipped to the browser beyond what an operator's role permits — enforced by RBAC, see Security Model).

## 6. Data Platform Principles

- Every trip record captures structured, ML-ready fields from day one (origin/destination, distance, duration, traffic estimate, estimated/actual fare, trust score, timestamp/day-of-week, anonymized device/user reference) — see Database Schema.
- Anonymization: trip records reference a pseudonymous `rider_ref` (device ID or user ID), never raw PII (phone number, email) in the analytical tables. PII lives only in the Identity module's own schema.
- The schema is designed so a future ML pipeline can read directly from a read replica / analytical schema without touching operational tables.
- **Data Quality Platform (added, ADR-0019 — see `18-platform-extensions.md` §1):** "ML-ready" is no longer just a schema property, it's an independently governed judgment. Every completed trip gets a `DataQualityAssessment` (component scores for GPS/Route/Fare/User-Input/Device-Signals, plus overall score and `readinessStatus`), computed independently of Trust's fraud/reward verdict. The **only** sanctioned read path for any future ML training/export job is `dataquality.ml_ready_trip_dataset`, a view hard-filtered to `readinessStatus = READY_FOR_AI` — structurally preventing unreviewed low-quality data from silently entering the training set, the same way ADR-0008 structurally prevents Reward from bypassing Trust.
- **Provenance & Reproducibility (added, ADR-0022):** every computed value that feeds a downstream decision (fare estimate, traffic estimate, trust score, data quality score, reward grant) carries an explicit `Provenance { source, producedByVersion, computedAt }` and is logged in `platform.provenance_log`. Combined with versioned configuration (ADR-0017) and the Fare Policy Engine's own versioning (ADR-0021), every historical trip is fully reproducible: which policy priced it, which trust engine version/config verified it, which data-quality engine version/config assessed it, which reward policy paid it.

## 7. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Mobile | Flutter | Single codebase iOS/Android, strong map plugin ecosystem |
| Backend | NestJS (TypeScript, Node.js) | Modular DI-first framework maps directly onto our module/port-adapter architecture |
| Admin Web | React (+ TypeScript) | Mature ecosystem for data-dense admin UIs |
| Database | PostgreSQL + PostGIS | Best-in-class open-source geospatial querying (geofencing, route/radius targeting, distance calc) |
| Routing | OSRM | Open-source, self-hostable, no per-request billing |
| Geocoding | Nominatim | Open-source, self-hostable, OSM-based |
| Maps/Tiles | OpenStreetMap + MapLibre/Leaflet/flutter_map | Open data, no vendor lock-in |
| Push | Firebase Cloud Messaging | Free tier sufficient at MVP; abstracted behind `NotificationProvider` |
| Cache/Queue | Redis | Session cache, rate limiting, background job queue (BullMQ) |
| Object Storage | S3-compatible (MinIO-ready) | Self-hostable, standard API |
| Infra | Docker + Docker Compose (MVP) → Kubernetes-ready | Container-first from day one for portability |

## 8. Cost Strategy

The platform explicitly avoids architectures built around pay-per-request commercial APIs (e.g., Google Maps/Directions/Places billing per call). All chosen defaults (OSM/OSRM/Nominatim/PostGIS) are open-source and self-hostable. **Revised on architecture review (Improvement Report B7):** because a single-city OSM extract makes a self-hosted OSRM+Nominatim footprint cheap from day one (a single small VM, not a cluster), MVP targets **self-hosted infrastructure directly**, skipping an interim hosted-instance stage — there is no cost-optimal reason to stand up a hosted dependency only to migrate away from it shortly after. The Provider Abstraction layer (ADR-0003) still governs the interface either way, so this is a sequencing correction, not a reversal of the self-hosting goal. See ADR-0005 and Deployment Strategy §5.

## 9. Cross-Cutting Concerns

- **Configuration**: environment + database-backed dynamic config — now a full Configuration Platform (ADR-0017) covering trust thresholds, reward rules, GPS thresholds, fraud thresholds, advertising targeting defaults, rate limits, and data-quality thresholds/weights, plus the separately-owned Fare Policy Engine (ADR-0021) — admins change behavior without deploys, every publish versioned/audited/rollback-capable. **Cache invalidation (ADR-0013):** "current effective version" reads are short-TTL cached (10–30s); `TrustThresholdConfig` additionally uses Redis pub/sub invalidation given its incident-response sensitivity — required from the first horizontally-scaled deployment, not added reactively.
- **Feature Management (added, ADR-0018):** a distinct platform from Configuration — governs whether a code path is active for whom (toggles, percentage rollouts via deterministic hashing, environment/city scoping, user segments, A/B experiments) rather than what business-rule value applies. Kill-switch flags share the same fast pub/sub invalidation path as `TrustThresholdConfig`, propagating in seconds rather than the standard 10–30s TTL.
- **Logging & Audit**: structured JSON logs; every admin action and trust/reward decision is audit-logged (immutable, append-only) — required for the Trust/Reward integrity story and future dispute resolution.
- **Monitoring**: health endpoints per module, metrics exported (Prometheus-compatible), alerting on Trust Engine anomaly rate spikes and API error rates.
- **Domain Event Delivery (revised, ADR-0011, ADR-0023, ADR-0024):** every domain event is written to a **transactional outbox** table (with an `event_version` and `correlation_id`) in the same DB transaction as the state change that produced it, then drained by a relay (a partitioned, per-aggregate-ordered claim scheme at scale — ADR-0023) — never a bare in-process `EventEmitter` with no durability guarantee. Idempotency is keyed on each event's own durable identity via `platform.event_consumption_log`, never on `(event_type, aggregate_id)`. Events exceeding a configurable retry ceiling move to a dead-letter table with an alert (ADR-0024), rather than retrying forever or silently vanishing. This is a correctness requirement from Phase 3 onward, not a scale-driven upgrade deferred to later.
- **Rate Limiting**: Redis-backed distributed counters (ADR-0013) for OTP, trip creation, GPS ingestion, and ad-serve endpoints — must be correct under multiple backend instances from the first implementation, since per-instance in-memory limiting silently under-counts abuse the moment a second instance is deployed.
- **Distributed Tracing (added, ADR-0027):** every request's `correlationId` propagates through the outbox payload into every downstream async consumer (Trust, Data Quality, Reward), enabling one trace to reconstruct a trip's entire async journey. OpenTelemetry instrumentation is adopted from Phase 3, not deferred until the async event chain (now spanning at least four contexts per trip) makes debugging without it painful enough to force the issue.
- **Dual Control for High-Risk Changes (added, ADR-0026):** publishing a new version of a high-risk configuration aggregate (trust/fraud/GPS/data-quality thresholds) or toggling a high-risk kill switch requires a second, different admin's approval before taking effect — a `SUPER_ADMIN`-only, audit-logged emergency override exists for genuine incidents. No single admin account can unilaterally disable fraud/quality protection outside that declared, accountable path.

## 10. Multi-City & Extensibility

- `City` is a first-class configuration entity: fare policy versions, trust/fraud/GPS/data-quality thresholds, geofences, campaign regions, and map bounds are all scoped by `city_id`. Alexandria is the first row, not a hardcoded assumption. **Extraction caveat (added, Pre-Implementation Audit §1):** `City` has wide FK fan-in across nearly every schema; if Trust or Data Quality is ever extracted into its own service/database (§1, already-anticipated extraction candidates), that service needs either a synchronously-replicated read copy of `City` or to treat `city_id` as an opaque, unvalidated reference — a decision deliberately deferred until an actual extraction is planned, not resolved speculatively now.
- New reward providers and ad providers are added as new adapters implementing the existing `RewardProvider`/`AdProvider` ports — no core changes.
- Future AI fare prediction plugs in as an alternate strategy behind the Fare Policy Engine's `computeFareRange` interface (rule-based strategy today, ML-based strategy later, trained against the `dataquality.ml_ready_trip_dataset` view), selectable per city/route via configuration.
- **Bounded-context count:** the platform now has 10 bounded contexts (Identity, Trip, Fare Policy, Trust, Reward, Advertising, Data Quality, Configuration, Feature Management, Administration) — see `03-domain-model.md` for the authoritative model and `18-platform-extensions.md` for why the three new ones (Fare Policy, Data Quality, Feature Management) were added.
