# API Specification

**Status:** Draft v1.0 — Phase 1
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

## 2. Identity & Auth Module — `/auth`

| Method | Path | Description |
|---|---|---|
| POST | `/auth/guest` | Create/resume a guest session from `deviceAnonId`. Returns JWT scoped to `GUEST` rider. |
| POST | `/auth/otp/request` | Request an OTP to a phone number. |
| POST | `/auth/otp/verify` | Verify OTP; promotes/creates `REGISTERED` rider, merges guest history if `deviceAnonId` provided. Returns JWT. |
| POST | `/auth/google` | Exchange Google ID token; promote/create rider. |
| POST | `/auth/apple` | Exchange Apple ID token; promote/create rider. |
| POST | `/auth/refresh` | Exchange refresh token for new access token. |
| POST | `/auth/logout` | Revoke refresh token. |

## 3. Trip Module — `/trips`

| Method | Path | Description |
|---|---|---|
| POST | `/trips/estimate` | Body: `{ origin, destination, cityId }`. Returns `{ estimatedFareMin, estimatedFareMax, distanceMeters, estimatedDurationSeconds, route }`. No trip is persisted yet. |
| POST | `/trips` | Start a trip from a prior estimate. Body: `{ origin, destination, cityId, estimateRef }`. Returns `Trip` in `ACTIVE` status. |
| POST | `/trips/{tripId}/gps` | Append GPS ping(s) during an active trip. Body: `{ pings: [{ lat, lng, accuracy, speed, recordedAt }] }`. Accepts batched pings for offline-buffered flush. |
| GET | `/trips/{tripId}/live` | Current live-tracking snapshot: position, traveled route, remaining distance/time, updated fare estimate. |
| POST | `/trips/{tripId}/complete` | Body: `{ actualFare }`. Transitions trip to `COMPLETED`, triggers async Trust Engine evaluation. Idempotent via `Idempotency-Key`. |
| POST | `/trips/{tripId}/cancel` | Cancel an active trip. |
| GET | `/trips/{tripId}` | Trip detail (owning rider only). |
| GET | `/trips` | Paginated trip history for the authenticated rider. |
| GET | `/trips/{tripId}/trust` | Trust verdict + score for a completed trip (rider-visible subset only — full signal detail is admin-only). |

## 4. Reward Module — `/rewards`

| Method | Path | Description |
|---|---|---|
| GET | `/rewards/wallet` | Current points balance + recent ledger entries for the authenticated rider. **Registered riders only** for redemption actions; guests can view accrued (unsynced) balance tied to `deviceAnonId`. |
| GET | `/rewards/offers` | Browsable list of active `RewardOffer`s, filterable by city/merchant/category. |
| POST | `/rewards/offers/{offerId}/redeem` | Redeem points for an offer. Requires `REGISTERED` rider (403 `REGISTRATION_REQUIRED` otherwise). |

## 5. Advertising Module — `/ads`

| Method | Path | Description |
|---|---|---|
| GET | `/ads/serve` | Query params: `tripId` or `{lat,lng}`. Returns priority-ranked matched campaign creative(s) for current context. Internally records an `AdImpression`. |
| POST | `/ads/{impressionId}/click` | Records an `AdClick` against a prior impression. |

## 6. Configuration (public-read subset) — `/config`

| Method | Path | Description |
|---|---|---|
| GET | `/config/cities` | Active cities with bounds, used by mobile app to scope map/search. |
| GET | `/config/feature-flags` | Client-relevant feature flags. |

## 7. Admin API Module — `/admin/*`

All routes require an `admin` JWT with an RBAC role claim (see Security Model). Representative resources (full CRUD + list/filter/export patterns apply to each):

| Resource | Path prefix | Notes |
|---|---|---|
| Users/Riders | `/admin/riders` | View, search, merge, deactivate. |
| Trips | `/admin/trips` | View, filter by trust verdict/city/date, manual re-review. |
| Trust Review Queue | `/admin/trust/flagged` | Trips with `FLAGGED_FOR_REVIEW` verdict; approve/reject with reason (audit-logged). |
| Rewards | `/admin/rewards/offers`, `/admin/rewards/ledger` | Manage offers; read-only ledger inspection. |
| Merchants | `/admin/merchants` | CRUD. |
| Campaigns | `/admin/campaigns` | CRUD, approve/pause, budget adjustment. |
| Analytics/Reports | `/admin/reports/*` | Heatmaps, verified-rate trends, campaign performance, fare-accuracy metrics. |
| Configuration | `/admin/config/fare-rules`, `/admin/config/trust-thresholds`, `/admin/config/reward-rules` | Create new versioned config entries (never edit in place). |
| Audit Logs | `/admin/audit-logs` | Read-only, filterable. |
| System Health | `/admin/system/health` | Aggregated module health/monitoring. |

## 8. Domain Event Webhooks (internal, future external-ready)

Reserved for Phase 8+: `POST /webhooks/merchant/{merchantId}` to notify merchants of campaign events. Not implemented at MVP; interface reserved so Reward/Ad providers can be external without a contract redesign.

## 9. Rate Limiting

- Guest endpoints (`/trips/estimate`, `/auth/guest`) are rate-limited per `deviceAnonId` + IP to mitigate abuse/scraping (see Threat Model).
- `/trips/{tripId}/gps` rate-limited per trip to a sane max ping frequency.

## 10. OpenAPI

Full machine-readable OpenAPI 3.1 schema will be generated directly from NestJS decorators (`@nestjs/swagger`) in Phase 3 onward — this document is the human-authored contract it must stay consistent with; the generated spec is the source of truth for client codegen once implementation begins.
