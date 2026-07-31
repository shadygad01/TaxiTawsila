# Domain Model

**Status:** Draft v1.0 — Phase 1

Modeled with Domain-Driven Design: each **Bounded Context** below maps 1:1 to a backend module (see Architecture §1) and a Postgres schema (see Database Schema).

## 1. Bounded Contexts Overview

```mermaid
flowchart LR
    Identity[Identity Context]
    Trip[Trip Context]
    Trust[Trust Context]
    Reward[Reward Context]
    Ads[Advertising Context]
    Config[Configuration Context]
    Admin[Administration Context]

    Trip -- TripCompleted --> Trust
    Trust -- TripVerified/TripRejected --> Reward
    Trip -- location/route --> Ads
    Identity -- RiderRef --> Trip
    Identity -- RiderRef --> Reward
    Config -- FareRules/TrustThresholds/RewardRules --> Trip
    Config --> Trust
    Config --> Reward
    Admin -- reads/manages --> Trip
    Admin -- reads/manages --> Trust
    Admin -- reads/manages --> Reward
    Admin -- reads/manages --> Ads
    Admin -- reads/manages --> Identity
```

## 2. Identity Context

**Responsibility:** manage passenger identity across the guest → registered lifecycle. Owns no trip or reward business logic — only "who is this rider."

- **Aggregate: `Rider`**
  - `RiderId` (UUID, stable for life of the identity)
  - `kind`: `GUEST | REGISTERED`
  - `deviceAnonId`: UUID bound at first app launch (guest join-key)
  - `authIdentities[]`: linked OTP phone / Google / Apple identities (only present once registered)
  - `createdAt`, `registeredAt?`
  - Invariant: a `GUEST` rider can be promoted to `REGISTERED` exactly once, preserving `RiderId` — all historical trips/points carry forward (merge-on-registration), never re-keyed.
  - **Invariant (added on architecture review, ADR-0009):** merge-on-registration only occurs when the device's own local `Rider` is still `GUEST` at the moment of registration. If the auth identity being linked already belongs to a different, existing `REGISTERED` rider, promotion does not happen — the device authenticates into that existing `Rider` instead, and the device's prior guest history is left un-migrated. This closes a cross-account history-injection vector (see Threat Model §2).
- **Value Objects:** `PhoneNumber`, `AuthProviderRef`
- **Domain Events:** `RiderRegistered`, `RiderPromotedFromGuest`

## 3. Trip Context

**Responsibility:** the full lifecycle of a single trip: estimate → live tracking → completion.

- **Aggregate Root: `Trip`**
  - `TripId` (UUID)
  - `riderRef` (RiderId, from Identity)
  - `cityId`
  - `origin: GeoPoint`, `destination: GeoPoint`
  - `status`: `ESTIMATED → ACTIVE → COMPLETED → CANCELLED`
  - `estimatedFareRange: { min: Money, max: Money }`
  - `actualFare: Money?` (set only at completion)
  - `route: RoutePolyline` (from RoutingProvider, immutable once trip starts)
  - `distanceMeters`, `estimatedDurationSeconds`
  - `gpsTrack: GpsPing[]` (append-only during ACTIVE)
  - `startedAt`, `completedAt?`
  - Invariants: `actualFare` can only be set when `status = COMPLETED`; `gpsTrack` is append-only and never mutated retroactively (integrity requirement for Trust Engine).
- **Entities:** `GpsPing { lat, lng, accuracy, speed, recordedAt, receivedAt }` — `receivedAt` is server-stamped and cross-checked against `recordedAt` as a trust signal (added on architecture review, ADR-0015).
- **Value Objects:** `GeoPoint`, `Money`, `RoutePolyline`, `FareRange`
- **Domain Services:** `FareEstimationService` (strategy-pluggable, see Architecture §10; consumes a `TrafficProvider` port per ADR-0012), `TripLifecycleService`
- **Domain Events:** `TripStarted`, `TripCompleted { tripId, estimatedFare, actualFare, gpsTrack, route }`, `TripCancelled` — published via the transactional outbox (ADR-0011), not a bare in-process emitter, so `TripCompleted` can never be silently lost between commit and Trust Engine consumption.
- **Implementation note (added on architecture review, Review §1):** `GPSMod`/`FareMod`/`HistMod` referenced in the Architecture C4 diagram are internal service classes within this one Trip module/aggregate — not separate bounded contexts or sibling modules with their own public interface.

## 4. Trust Context

**Responsibility:** independently evaluate every completed trip and assign a `TrustScore`. Never mutates the `Trip` aggregate directly — Trust is a downstream, independent judgment, by design (auditability, and so trust logic can evolve without touching trip data).

- **Aggregate Root: `TripTrustAssessment`**
  - `TripId` (reference, 1:1 with Trip)
  - `trustScore`: 0–100
  - `signals: TrustSignalResult[]` — one row per rule evaluated (GPS continuity, duration plausibility, distance plausibility, speed plausibility, origin/destination consistency, route deviation, GPS signal quality, fare plausibility, duplicate-trip check, impossible-trip check, spoofing indicators)
  - `verdict`: `VERIFIED | REJECTED | FLAGGED_FOR_REVIEW`
  - `evaluatedAt`, `ruleSetVersion` (so historical assessments are reproducible/auditable against the rule version that produced them)
- **Value Objects:** `TrustSignalResult { signalName, score, weight, detail }`, **`TripFeatureSnapshot`** (added on architecture review, Improvement Report B5: the per-trip feature vector — distance, duration, avg/max speed, stop count, route-deviation ratio, time-of-day bucket, day-of-week — persisted at scoring time as first-class ML-ready data, rather than requiring future recomputation from raw, retention-pruned `gps_ping` rows)
- **Domain Services:** `TrustScoringEngine` (composes pluggable `TrustSignalEvaluator[]`, each independently unit-testable), `FraudPatternDetector`
- **Domain Events:** `TripVerified { tripId, trustScore }`, `TripRejected { tripId, reason }` — published via the transactional outbox (ADR-0011), consumed idempotently by Reward.
- **Policy:** `verdict = REJECTED` or `trustScore < config.trustThreshold` ⇒ no `TripVerified` event is ever published ⇒ Reward context structurally cannot grant points for it.

## 5. Reward Context

**Responsibility:** points ledger and redemption, decoupled from *how* points are earned via provider adapters.

- **Aggregate Root: `RewardWallet`**
  - `riderRef` (RiderId)
  - `pointsBalance` — **derived, not independently written** (added on architecture review, ADR-0016): computed as `SUM(ledger entries)` inside the same transaction as any new ledger entry; never incremented/decremented as a separate write, which is what prevents a double-redemption race.
  - `ledger: RewardLedgerEntry[]` (append-only: `EARN` from verified trips, `REDEEM` against a `RewardProvider`)
- **Entity: `RewardLedgerEntry { entryId, type, points, sourceTripId?, providerRef?, createdAt }`**
- **Aggregate: `RewardOffer`** (a redeemable item: coupon/merchant promo), owned by a `RewardProvider` adapter, with `pointsCost`, `merchantId`, `validity window`.
- **Domain Services:** `RewardRuleEngine` (points-per-verified-trip, configurable, possibly tiered by trust score/distance), `RedemptionService` (requires `Rider.kind = REGISTERED`, enforced as a domain invariant, not just a UI gate; redemption transaction recomputes and validates balance non-negativity per ADR-0016, not a read-then-write across two statements).
- **Domain Events:** `PointsEarned`, `PointsRedeemed`

## 6. Advertising Context

**Responsibility:** merchant campaigns, geo-targeting, and delivery/analytics — entirely first-party, since ad serving is core platform IP.

- **Aggregate Root: `Campaign`**
  - `campaignId`, `merchantId`, `cityId`
  - `targeting: { geofences: Geofence[], routeTargets: RouteTarget[], radiusTargets: RadiusTarget[] }`
  - `schedule: { startAt, endAt, dayparting? }`
  - `priority`, `budget: { limit, spent }`
  - `status`: `DRAFT | ACTIVE | PAUSED | EXHAUSTED | ENDED`
- **Entities:** `Merchant { merchantId, name, cityId, category }`, `Impression { campaignId, riderRef, tripId?, servedAt, context }`, `Click { impressionId, clickedAt }`
- **Domain Services:** `CampaignTargetingEngine` (evaluates active campaigns against a trip's origin/destination/route/live-position and returns priority-ranked matches), `BudgetEnforcementService`
- **V1 simplification (added on architecture review, ADR-0014):** `priority`/`budget` pacing exist in the schema from day one, but MVP's `CampaignTargetingEngine` implementation only needs to return the single best-matching active campaign (ties broken by creation order) — full priority-weighted, budget-paced arbitration is deferred until real merchant volume creates genuine overlapping-targeting competition. Evaluation is triggered at trip-lifecycle moments (start, ~60–90s/displacement intervals, completion), never per raw GPS ping, and is pre-filtered by a coarse spatial bucket before precise PostGIS containment.
- **Domain Events:** `AdImpressionRecorded`, `AdClicked`, `CampaignBudgetExhausted`

## 7. Configuration Context

**Responsibility:** all tunable platform behavior, versioned and admin-editable without deploys.

- **Aggregates:** `FareRuleSet` (per city: base fare, per-km rate, time-of-day multipliers, waiting charge), `TrustThresholdConfig` (per city: minimum verified score, per-signal weights), `RewardRuleConfig` (points per verified trip, tiering).
- All configuration aggregates are versioned (`effectiveFrom`), never destructively edited, so past trips can be judged against the rules in force at the time.

## 8. Administration Context

**Responsibility:** the operational read/write surface over every other context, gated by RBAC (see Security Model). Not a separate business domain — a composed application layer exposing controlled cross-context operations (audit log, user management, campaign approval, trust-review queue, reports).

## 9. Shared Kernel

Types shared across every context (in a shared package, not duplicated): `Money`, `GeoPoint`, `CityId`, `RiderId`, `TripId`, `Result<T, E>` error-handling convention, domain event envelope `{ eventId, occurredAt, payload }`.
