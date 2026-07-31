# API Specification

**Status:** v1.1 — extended with Fare Policy, Data Quality, Feature Management, and Configuration Platform endpoints (see `18-platform-extensions.md`) before Phase 2.
**Style:** REST over HTTPS, JSON, versioned via URL prefix (`/api/v1/...`)

## 1. Conventions

- **Base URL:** `https://api.taxitawsila.app/api/v1`
- **Auth:** `Authorization: Bearer <JWT>` for both guest and registered sessions (see §2). Admin endpoints additionally require an RBAC role claim.
- **Content type:** `application/json; charset=utf-8`
- **Pagination:** cursor-based — `?limit=20&cursor=<opaque>`; response includes `nextCursor`.
- **Error format** (RFC 7807-inspired):
```json
{
  "error": {
    "code": "TRIP_NOT_FOUND",
    "message": "Trip does not exist or is not accessible to this rider.",
    "details": {}
  }
}
```
- **Idempotency:** mutating endpoints that can be safely retried (e.g., trip completion) accept an `Idempotency-Key` header.
- **Versioning policy:** breaking changes ⇒ new `/v2`; additive fields never break `/v1` consumers.
- **Versioned-config write pattern (new, ADR-0017):** every admin write to a `config.*`/`farepolicy.*` aggregate is a `POST .../versions` (never `PUT`/`PATCH` on an existing version — versions are immutable once published). Rollback is `POST .../versions/rollback` with `{ rollbackToVersionId }`, which publishes a new version copying that target's field values and stamping `rolledBackFrom`. This one pattern is reused verbatim across every config resource below.

## 2. Identity & Auth Module — `/auth`

| Method | Path | Description |
|---|---|---|
| POST | `/auth/guest` | Create/resume a guest session from `deviceAnonId`. Returns JWT scoped to `GUEST` rider. |
| POST | `/auth/otp/request` | Request an OTP to a phone number. |
| POST | `/auth/otp/verify` | Verify OTP; promotes/creates `REGISTERED` rider, merges guest history if `deviceAnonId` provided **and that device's rider is still `GUEST`** (ADR-0009) — if the phone number already belongs to a different existing `REGISTERED` rider, no merge occurs and the response simply authenticates into that account. Returns JWT. |
| POST | `/auth/google` | Exchange Google ID token; promote/create rider. |
| POST | `/auth/apple` | Exchange Apple ID token; promote/create rider. |
| POST | `/auth/refresh` | Exchange refresh token for new access token. |
| POST | `/auth/logout` | Revoke refresh token. |

## 3. Trip Module — `/trips`

| Method | Path | Description |
|---|---|---|
| POST | `/trips/estimate` | Body: `{ origin, destination, cityId }`. Internally resolves the active `FarePolicyVersion` (ADR-0021) and a `TrafficProvider` signal (ADR-0012). Returns `{ estimatedFareMin, estimatedFareMax, estimatedFareProvenance, trafficEstimateProvenance, distanceMeters, estimatedDurationSeconds, route, farePolicyVersionId }`. No trip is persisted yet. |
| POST | `/trips` | Start a trip from a prior estimate. Body: `{ origin, destination, cityId, estimateRef }`. Returns `Trip` in `ACTIVE` status, carrying the same `farePolicyVersionId`/provenance fields from the estimate. |
| POST | `/trips/{tripId}/gps` | Append GPS ping(s) during an active trip. Body: `{ pings: [{ clientPingId, lat, lng, accuracy, speed, recordedAt }] }`. Idempotent on `(tripId, clientPingId)` (ADR-0015); batches capped at a fixed max size per request; server additionally stamps `receivedAt` — not client-supplied. |
| GET | `/trips/{tripId}/live` | Current live-tracking snapshot: position, traveled route, remaining distance/time, updated fare estimate. |
| POST | `/trips/{tripId}/complete` | Body: `{ actualFare }`. Transitions trip to `COMPLETED`, publishes `TripCompleted` via the outbox (ADR-0011), which triggers **both** Trust Engine and Data Quality Engine evaluation independently (ADR-0019). Idempotent via `Idempotency-Key`. |
| POST | `/trips/{tripId}/cancel` | Cancel an active trip. |
| GET | `/trips/{tripId}` | Trip detail (owning rider only). |
| GET | `/trips` | Paginated trip history for the authenticated rider. |
| GET | `/trips/{tripId}/trust` | Trust verdict + score for a completed trip (rider-visible subset only — full signal detail is admin-only). |
| GET | `/trips/{tripId}/data-quality` | **New.** Rider-visible subset of the trip's `DataQualityAssessment`: `overallScore` and `readinessStatus` only — component-level detail and any open `DataReviewCase` are admin-only. Primarily used to show a rider-facing "still verifying your trip data" state consistent with the eventual-consistency UX already required for Trust (Architecture Review §4). |

## 4. Reward Module — `/rewards`

| Method | Path | Description |
|---|---|---|
| GET | `/rewards/wallet` | Current points balance + recent ledger entries for the authenticated rider. **Registered riders only** for redemption actions; guests can view accrued (unsynced) balance tied to `deviceAnonId`. Each `EARN` ledger entry includes its `rewardRuleConfigId` (ADR-0022) for transparency into which policy version produced it. |
| GET | `/rewards/offers` | Browsable list of active `RewardOffer`s, filterable by city/merchant/category. |
| POST | `/rewards/offers/{offerId}/redeem` | Redeem points for an offer. Requires `REGISTERED` rider (403 `REGISTRATION_REQUIRED` otherwise). Subject to `dailyPointLimit` if configured (new, `RewardRuleConfig`); returns `429 DAILY_LIMIT_EXCEEDED` if breached. |

## 5. Advertising Module — `/ads`

| Method | Path | Description |
|---|---|---|
| GET | `/ads/serve` | Query params: `tripId` or `{lat,lng}`. Returns the best-matching active campaign creative for current context (V1: single best match, ties by creation order — full priority arbitration deferred, see ADR-0014). Default radius/tie-break rule read from `AdvertisingTargetConfig` (new). Internally records an `AdImpression`. **Call-cadence contract (ADR-0014): clients must call this only at trip-lifecycle moments — trip start, periodic ~60–90s/displacement-threshold intervals, and trip completion — never on every raw GPS ping.** |
| POST | `/ads/{impressionId}/click` | Records an `AdClick` against a prior impression. |

## 6. Configuration & Feature Management (public-read subset) — `/config`, `/features`

| Method | Path | Description |
|---|---|---|
| GET | `/config/cities` | Active cities with bounds, used by mobile app to scope map/search. |
| GET | `/features/resolve` | **Revised (ADR-0018).** Query params: implicit from JWT (`riderId`/`deviceAnonId`), plus `cityId`, `environment`. Returns a flat, pre-resolved map of `{ flagKey: boolean | variantKey }` for every flag/experiment relevant to the caller — all toggle/percentage-rollout/segment/kill-switch/experiment-variant logic is resolved **server-side**; the client never receives raw targeting rules, only the final resolved value per key. Experiment exposures are recorded server-side on first resolution (`feature_exposure_log`), not client-reported. Supersedes the old flat `/config/feature-flags` endpoint. |

## 7. Admin API Module — `/admin/*`

All routes require an `admin` JWT with an RBAC role claim (see Security Model). Representative resources (full CRUD + list/filter/export patterns apply to each):

| Resource | Path prefix | Notes |
|---|---|---|
| Users/Riders | `/admin/riders` | View, search, merge, deactivate. |
| Trips | `/admin/trips` | View, filter by trust verdict/data-quality readiness/city/date, manual re-review. |
| Trust Review Queue | `/admin/trust/flagged` | Trips with `FLAGGED_FOR_REVIEW` verdict; approve/reject with reason (audit-logged). Reward-eligibility review — **distinct from Data Quality's review queue below** (ADR-0019/0020). |
| **Data Quality Review Queue** *(new, ADR-0020)* | `/admin/data-quality/review-cases` | List `PENDING_REVIEW`/`ESCALATED` cases, filterable by city/readiness-status. |
| | `POST /admin/data-quality/review-cases/{caseId}/approve` | → `APPROVED`; `readinessStatus` becomes `READY_FOR_AI`. |
| | `POST /admin/data-quality/review-cases/{caseId}/reject` | → `REJECTED`, with required reason (audit-logged); permanently excluded from ML datasets. |
| | `POST /admin/data-quality/review-cases/{caseId}/merge` | Body: `{ canonicalTripId }` → `MERGED`; this trip permanently excluded, canonical trip retained. |
| | `POST /admin/data-quality/review-cases/{caseId}/correct` | Body: `{ field, newValue, reason }` → `CORRECTED`; writes a `MANUAL_OVERRIDE` provenance entry (ADR-0022) for the corrected field, then re-evaluates `readinessStatus` (typically `READY_FOR_AI`). |
| | `POST /admin/data-quality/review-cases/{caseId}/escalate` | → `ESCALATED`, with required reason. |
| | `GET /admin/data-quality/review-cases/{caseId}/history` | Full `data_review_case_event` audit trail for the case. |
| **Data Quality Assessments** *(new)* | `/admin/data-quality/assessments` | Read-only: full component-score breakdown, `engineVersion`, `qualityConfigId` per trip — the admin-only detail hidden from `GET /trips/{tripId}/data-quality`. |
| Rewards | `/admin/rewards/offers`, `/admin/rewards/ledger` | Manage offers; read-only ledger inspection (each `EARN` entry shows its `rewardRuleConfigId`). |
| Merchants | `/admin/merchants` | CRUD. |
| Campaigns | `/admin/campaigns` | CRUD, approve/pause, budget adjustment. |
| Analytics/Reports | `/admin/reports/*` | Heatmaps, verified-rate trends, data-quality-readiness trends, campaign performance, fare-accuracy metrics (regression-tested against `FarePolicyVersion` replay, ADR-0021). |
| **Fare Policy** *(new, ADR-0021)* | `/admin/config/fare-policy-versions` | `GET` list/history per city; `POST .../versions` publish a new version (`DRAFT` or immediately `ACTIVE` per `effectiveFrom`); `POST .../versions/rollback` per §1's pattern. |
| Configuration | `/admin/config/trust-thresholds`, `/admin/config/reward-rules`, `/admin/config/gps-thresholds` *(new)*, `/admin/config/fraud-thresholds` *(new)*, `/admin/config/advertising-target` *(new)*, `/admin/config/rate-limits` *(new)*, `/admin/config/data-quality-thresholds` *(new)* | All follow the `POST .../versions` + `POST .../versions/rollback` pattern (§1); create new versioned entries, never edit in place. |
| **Feature Management** *(new, ADR-0018)* | `/admin/features/flags` | CRUD on `FeatureFlag` (toggle/percentage-rollout/kill-switch/experiment-linked); toggling `isKillSwitch=true` flags propagates via the fast pub/sub path (ADR-0013), not the standard TTL cache. |
| | `/admin/features/segments` | CRUD on `FeatureSegment` declarative rules. |
| | `/admin/features/experiments` | CRUD on `FeatureExperiment`; `POST .../{key}/conclude` ends an experiment; `GET .../{key}/exposure-summary` returns per-variant exposure counts for analysis. |
| Audit Logs | `/admin/audit-logs` | Read-only, filterable — now also covers every versioned-config publish/rollback across `config`/`farepolicy`/`feature`. |
| System Health | `/admin/system/health` | Aggregated module health/monitoring. |

## 8. Domain Event Webhooks (internal, future external-ready)

Reserved for Phase 8+: `POST /webhooks/merchant/{merchantId}` to notify merchants of campaign events. Not implemented at MVP; interface reserved so Reward/Ad providers can be external without a contract redesign.

## 9. Rate Limiting

- Guest endpoints (`/trips/estimate`, `/auth/guest`) are rate-limited per `deviceAnonId` + IP to mitigate abuse/scraping (see Threat Model). Limits are read from `config.rate_limit_config` (new, admin-tunable per ADR-0017), enforced via the Redis-backed distributed limiter (ADR-0013) — never a hardcoded constant.
- `/trips/{tripId}/gps` rate-limited per trip to a sane max ping frequency (`GPS_INGEST` scope in `rate_limit_config`).

## 10. OpenAPI

Full machine-readable OpenAPI 3.1 schema will be generated directly from NestJS decorators (`@nestjs/swagger`) in Phase 3 onward — this document is the human-authored contract it must stay consistent with; the generated spec is the source of truth for client codegen once implementation begins.
