# Security Model

**Status:** Draft v1.0 — Phase 1

## 1. Identity & Session Security

- **Guest sessions**: JWT issued against a `deviceAnonId`; short-lived access token (e.g., 15 min) + refresh token, both scoped to the `GUEST` rider role. No PII involved.
- **Registered sessions**: JWT additionally carries `riderId` and auth-provider claims. OTP flow: rate-limited request/verify endpoints, OTP codes short-lived (≤5 min), max attempt count before lockout, phone numbers never logged in plaintext (see §4).
- **Admin sessions**: separate JWT audience/issuer from passenger sessions, mandatory short expiry, RBAC role claim (see §3), and — recommended for Phase 3 — mandatory MFA for admin accounts with elevated roles.
- Refresh tokens are rotated on use (rotation-detection revokes the whole family if reuse is detected — mitigates token theft).
- **Signing-key rotation (added, Pre-Implementation Audit §5):** JWTs carry a `kid` (key ID) header from day one, even though only one signing key exists at MVP launch. Rotation is then a matter of publishing a new key under a new `kid`, accepting both old and new `kid`s for a transition window, and retiring the old one — a designed-in operational procedure from Phase 3, not an improvised one the first time rotation is actually needed years into operation.

## 2. Transport & Storage Security

- TLS 1.2+ enforced everywhere (mobile ↔ API, admin ↔ API, API ↔ database in production).
- Secrets (DB credentials, JWT signing keys, provider API keys) managed via environment-injected secrets (e.g., Docker/K8s secrets, or a secrets manager in cloud deployment) — never committed to the repo, never in client-side code.
- At-rest encryption: database volume encryption enabled at the infrastructure layer; any stored phone number is hashed (one-way, salted) for lookups and encrypted if reversible storage is ever needed (e.g., for OTP resend) — decision to store encrypted-reversible vs. hash-only finalized alongside the OTP provider integration in Phase 3.
- Mobile local storage: `deviceAnonId` and tokens stored via platform secure storage (Keychain/Keystore), never plain `SharedPreferences`/plist.

## 3. Authorization (RBAC)

Admin roles (extensible, defined in `admin.admin_user.role`):

| Role | Scope |
|---|---|
| `SUPER_ADMIN` | Full access, including configuration and RBAC management itself |
| `OPS_ANALYST` | Read trips/analytics/heatmaps, no write access |
| `TRUST_REVIEWER` | Read/write **trust** review queue only (`FLAGGED_FOR_REVIEW` reward-eligibility decisions) |
| `DATA_QUALITY_REVIEWER` *(new, added with the Data Quality Platform — ADR-0019/0020)* | Read/write the **Data Quality** Manual Review Queue only (`data_review_case` approve/reject/merge/correct/escalate) — deliberately a separate role from `TRUST_REVIEWER` since the two queues resolve different questions and may be staffed by different people (data-quality/ops vs. fraud/trust specialists) |
| `FEATURE_MANAGER` *(new, added with the Feature Management Platform — ADR-0018)* | Manage feature flags, segments, and experiments; toggling a **`riskTier = LOW`** flag takes effect immediately once logged. **Toggling a `riskTier = HIGH` kill switch requires a second, different admin's approval before it takes effect** (ADR-0026, added on Pre-Implementation Audit §5) — a `FEATURE_MANAGER` alone cannot unilaterally disable a Trust/Fraud/Reward-relevant code path; only a `SUPER_ADMIN` emergency override bypasses this, and that override is itself audit-logged with a mandatory reason. |
| `REWARDS_MANAGER` | Manage reward offers/providers, read ledger (no wallet mutation outside defined flows) |
| `CAMPAIGN_MANAGER` | Manage merchants/campaigns within assigned city/cities |
| `SUPPORT_AGENT` | Read-only rider/trip lookup for support cases, PII-redacted by default |

**Fare Policy and Configuration publishing** (new `FarePolicyVersion`, `TrustThresholdConfig`, and the rest of the Configuration Platform inventory — Domain Model §9) is restricted to `SUPER_ADMIN` by default at MVP; a narrower `POLICY_MANAGER` role scoped to fare-policy publishing only is a reasonable Phase 9 addition once there's a distinct team responsible for fare-policy compliance separate from platform administration, but is not required for MVP launch.

**Dual control for high-risk configuration (added, ADR-0026, Pre-Implementation Audit §5):** publishing a new version of `TrustThresholdConfig`, `FraudThresholdConfig`, `GpsThresholdConfig`, or `DataQualityThresholdConfig` requires a second `SUPER_ADMIN`-eligible admin (never the same admin who proposed it) to approve before the version becomes `ACTIVE` — closing a gap where a single compromised or careless account could otherwise unilaterally disable fraud/quality protection with only an after-the-fact audit trail as a safeguard. **Bus-factor caveat, worth naming explicitly:** this control is only as strong as there being genuinely more than one available `SUPER_ADMIN` account in practice — at MVP team size, ensure at least two people hold this role from launch, or the dual-control requirement degrades to "the same person approves their own change under a technicality." Tracked in Risk Analysis.

**City-scoping enforcement (clarified, added on Pre-Implementation Audit §1):** `CAMPAIGN_MANAGER`'s "assigned city/cities" scoping — and any future role with similar city-restricted access — is enforced by always intersecting the authenticated admin's assigned `city_id` set with the query filter at the repository layer, never by trusting a client-supplied `cityId` parameter alone. This is the same discipline already applied to rider-scoped queries (§3, "a rider can only read/mutate their own Trip/RewardWallet") extended explicitly to city-scoped admin roles, since a platform spanning many Egyptian cities makes cross-city data leakage a real, not theoretical, risk as the admin roster grows.

Enforcement: a single `RolesGuard` at the Nest interface layer, backed by a declarative `@Roles(...)` decorator per admin controller method — checked centrally, not duplicated per handler. Every RBAC-gated action is audit-logged (Database Schema §11) with before/after state.

Passenger-side authorization: a rider can only read/mutate their own `Trip`/`RewardWallet` — enforced by always scoping repository queries by the authenticated `riderId` from the JWT, never a client-supplied ID.

## 4. Data Protection & Privacy

- **PII isolation**: only the `identity` schema may store phone numbers/emails/social provider subjects. Every other schema — including the new `farepolicy`, `dataquality`, and `feature` schemas — references riders only by `rider_id` (opaque UUID) — a data export of `trip`/`trust`/`reward`/`advertising`/`dataquality`/`farepolicy`/`feature` schemas alone is inherently pseudonymous.
- **Logging discipline**: structured logs must never include phone numbers, OTP codes, raw JWTs, or precise GPS traces at `INFO` level or above; a lint/log-scrubbing middleware redacts known-sensitive field names.
- **Location data minimization**: `gps_ping` retention policy is time-bounded for raw pings post-trip-completion (aggregate/derived trip stats retained long-term for the data platform via `dataquality.trip_feature_snapshot`, which is exactly why that table was introduced — it survives raw-ping pruning; raw high-frequency pings pruned after a configurable window — default proposal: 12 months — per Risk Analysis/legal review). `platform.provenance_log` follows the same retention discipline as the values it describes — it is not exempted just because it's an audit table.
- **Right to deletion**: a registered rider can request account deletion; `identity` PII rows are hard-deleted, while pseudonymous historical trip/trust/reward rows are retained (already free of PII) unless local regulation requires full trip deletion — flagged for legal review in Risk Analysis.
- **Guest-identity reward-farming (accepted MVP risk, added on architecture review — see `16-architecture-review.md` §12–14 and ADR-0009):** because guest identity lives entirely in device-local secure storage, an app reinstall mints a fresh `deviceAnonId` and therefore a fresh reward-eligibility slate on the same physical device. MVP explicitly accepts this risk rather than requiring hardware attestation (Play Integrity/App Attest) up front, mitigated instead by capping early reward value and monitoring abuse rate; attestation-gated guest reward accrual is a named Phase 6+ hardening item to be built only if real abuse telemetry justifies the added complexity.
- **Guest-history merge policy (ADR-0009):** promotion of a `GUEST` rider to `REGISTERED` only carries over that device's history when the device's own local rider is still `GUEST` at that moment; if the identity being verified already belongs to a different existing `REGISTERED` rider, no merge occurs. This prevents a device farm from injecting fabricated guest history into an unrelated verified account.

## 5. Application-Layer Security Practices

- Input validation at every controller boundary (DTO + `class-validator`/`zod`); no trust in client-supplied computed values (e.g., a client cannot submit its own `estimatedFare` — it's server-computed). Client-supplied GPS `recorded_at` timestamps are likewise not trusted alone — the server additionally stamps `received_at` on ingestion, and large divergence between the two is fed to the Trust Engine as a signal (added on architecture review, ADR-0015).
- Rate limiting (per IP + per `deviceAnonId`/`riderId`) on: OTP request/verify, fare estimate, trip creation, GPS ping ingestion, ad-serve endpoints — mitigates enumeration, spam-trip generation, and reward farming. **Must be Redis-backed (shared counters), not per-instance in-memory** (ADR-0013, added on architecture review) — an in-memory limiter is silently multiplied by instance count the moment the backend is horizontally scaled, which is expected to happen well before the 10,000 MAU band. Redis unavailability must fail closed (deny/throttle), never fail open.
- CORS locked to known admin-web and mobile origins/app-check mechanisms; no wildcard origins in production.
- Dependency scanning (`npm audit`/Dependabot or equivalent) gated in CI; no known-critical-CVE dependency merges without an explicit, reviewed exception.
- Admin dashboard: CSRF protection on state-changing requests, Content-Security-Policy headers, XSS-safe rendering (React's default escaping preserved — no unchecked `dangerouslySetInnerHTML`).

## 6. Trust & Fraud-Adjacent Security

Security and data-integrity concerns unique to this platform's fraud surface (GPS spoofing, fake trips, reward abuse, ad fraud) are treated as a first-class discipline owned jointly by the Trust Engine and this Security Model — see the dedicated **Threat Model** (`10-threat-model.md`) for the structured STRIDE analysis and controls.

## 7. Infrastructure Security (MVP)

- Principle of least privilege for the application's DB role: no `SUPERUSER`, no `DROP`/`ALTER` in the runtime role, `REVOKE UPDATE, DELETE` on append-only tables (Database Schema §9); a separate migration role is used only by the CI/CD migration step.
- Network segmentation: database and cache not publicly reachable — only the backend service's private network can reach them.
- Regular automated backups of PostgreSQL with tested restore procedure (see Deployment Strategy).

## 8. Compliance Posture

- Aligns directionally with GDPR-style principles (data minimization, purpose limitation, right to deletion) as good practice, pending explicit Egyptian data-protection law (Law No. 151/2020) review — tracked as an open item in Risk Analysis §"Legal/Regulatory".
