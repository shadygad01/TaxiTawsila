# Threat Model

**Status:** Draft v1.0 — Phase 1
**Method:** STRIDE, applied per major asset/flow, with special emphasis on the platform's unique fraud surface (fake/manipulated trips, since trip data is the core asset and directly gates rewards).

## 1. Assets Being Protected

1. Trip data integrity (the core long-term data asset).
2. Reward points (real redeemable value — a fraud target).
3. Rider PII (phone numbers, auth identities).
4. Admin control plane (config, RBAC, campaign budgets).
5. Advertising spend/impression integrity (merchant trust).

## 2. STRIDE Analysis

### Spoofing

| Threat | Impact | Mitigation |
|---|---|---|
| GPS spoofing (mock-location apps, hardware spoofers) to fake a trip and farm rewards | Corrupts trip dataset; steals reward value | Trust Engine GPS-spoofing signal (mock-location OS flags where detectable, implausible signal-quality patterns, sensor-fusion cross-checks vs. accelerometer where available); trips below threshold never reward |
| Fake/duplicate rider identities (device farms) to farm guest rewards | Reward abuse at scale | Device-level rate limiting, trust scoring at the rider level (aggregate abuse pattern detection), CAPTCHA/attestation on suspicious volume (Play Integrity API / App Attest) |
| **(added on architecture review)** Single-device reinstall resets guest-identity reward-eligibility history, enabling repeated farming from one physical device without needing a device farm | Reward abuse, degraded data quality | Accepted MVP risk (Security Model §4): capped early reward value + abuse-rate monitoring; hardware attestation (Play Integrity/App Attest) gating guest reward accrual is a named Phase 6+ item if abuse data justifies it — see ADR-0009 |
| **(added on architecture review)** Registration-time account-merge injection: a device farm reachable to one real verified phone/Google/Apple identity attempts to inject fabricated guest trip/reward history into that unrelated account via the promotion path | Cross-account reward/data fraud | Guest-history merge only occurs when the device's own local rider is still `GUEST` at registration time; if the identity already belongs to a different `REGISTERED` rider, no merge happens (ADR-0009) |
| Impersonating another rider's session (token theft) | Account/points theft | Short-lived JWTs, refresh-token rotation with reuse detection, secure token storage on device |

### Tampering

| Threat | Impact | Mitigation |
|---|---|---|
| Client submits manipulated GPS pings or a fabricated route to shape trust scoring | Fraudulent trip verification | All fare/trust-relevant values computed server-side from raw pings; pings are append-only and immutable once written; server independently computes distance/route via RoutingProvider, compared against client-reported track |
| **(added on architecture review)** Client misreports GPS `recorded_at` timestamps to manipulate speed/plausibility signals (client clock is not a trusted source) | Fraudulent trip verification via manipulated speed/duration signals | Server stamps `received_at` on every ping at ingestion (ADR-0015); large divergence between client-claimed and server-observed timing deltas is itself a Trust Engine input, not silently trusted |
| Client submits a fabricated `actualFare` to farm reward tiers (if reward scales with fare) | Reward abuse | Fare-plausibility trust signal (compare actual fare against estimated range + city fare-rule bounds); anomalies flagged, not auto-rejected, to avoid false positives on legitimate negotiation variance |
| Admin audit log tampering | Loss of accountability | Audit log is append-only at the DB-role level (no UPDATE/DELETE grant to app runtime role) |

### Repudiation

| Threat | Impact | Mitigation |
|---|---|---|
| Admin denies having approved a flagged trip or changed a fare rule | Dispute / accountability gap | Every admin mutation audit-logged with actor, before/after state, timestamp (Database Schema §8); versioned config (ADR-0010) makes every historical decision reconstructable |

### Information Disclosure

| Threat | Impact | Mitigation |
|---|---|---|
| Trip/location data leaks reveal a rider's home/work pattern | Privacy harm, regulatory exposure | PII isolated to `identity` schema (Security Model §4); other schemas pseudonymous by construction; RBAC scoping (e.g., `SUPPORT_AGENT` gets redacted views) |
| Admin dashboard exposes raw PII to over-privileged roles | Privacy harm | RBAC least-privilege roles (Security Model §3); field-level redaction by role |
| Verbose error messages/logs leak internals or PII | Info leak | Log-scrubbing middleware; generic error responses to clients, detailed errors only in internal logs |

### Denial of Service

| Threat | Impact | Mitigation |
|---|---|---|
| Flood of fake trip-estimate/GPS-ping requests | Backend/DB overload, cost spike on hosted routing/geocoding | Rate limiting per IP/device (Security Model §5); circuit breaker + caching in front of `RoutingProvider`/`GeocodingProvider` adapters |
| OTP endpoint abused to spam SMS costs (toll fraud) | Direct financial cost | Aggressive per-number/per-IP rate limiting, CAPTCHA on repeated requests, provider-level fraud filters |

### Elevation of Privilege

| Threat | Impact | Mitigation |
|---|---|---|
| Passenger JWT manipulated/forged to gain admin claims | Full platform compromise | Separate signing keys/audiences for passenger vs. admin JWTs; signature verification on every request; short expiry |
| Admin role escalation via insecure role-assignment endpoint | Unauthorized admin actions | `SUPER_ADMIN`-only role-assignment mutation, audit-logged, ideally with a second-admin-approval step for role changes (Phase 9 consideration) |

## 3. Trip-Fraud-Specific Deep Dive (Core Platform Risk)

This platform's central integrity risk is **fabricated or manipulated trips**, because verified trips mint real reward value and, more importantly, corrupt the long-term data asset. Layered defenses:

1. **Structural**: Reward module has no code path to grant points except in reaction to a `TripVerified` event from the isolated Trust module (ADR-0008) — a compromised Trip module alone cannot mint rewards.
2. **Statistical/behavioral**: per-signal trust scoring (GPS continuity, speed plausibility, duplicate-trip detection, origin/destination consistency, route deviation) composed into one score, weighted and tunable per city via versioned config (ADR-0010) without a deploy.
3. **Rate/velocity**: a rider generating implausibly many verified trips per hour/day is itself a fraud signal, fed back into the Trust Engine as an aggregate-behavior evaluator, not just a per-trip one.
4. **Human-in-the-loop**: `FLAGGED_FOR_REVIEW` verdict routes ambiguous cases to the admin Trust Review Queue rather than a binary auto-accept/reject, preserving recall on genuine edge cases while limiting fraud that a purely automated threshold might miss or over-block.
5. **Never silent-delete**: rejected/flagged trips are retained (labeled) for ongoing fraud-pattern analysis and Trust Engine tuning — deleting them would blind the system to attack evolution.

## 4. Advertising/Merchant Fraud

| Threat | Impact | Mitigation |
|---|---|---|
| Fake impressions/clicks to drain a competitor's or one's own ad budget artificially | Merchant financial harm, billing disputes | Impression/click dedup windows, rider/device rate limiting on ad-serve calls, budget-exhaustion alerts reviewed before Phase 8 billing goes live |

## 5. Residual Risk & Open Items

- GPS-spoofing detection has fundamental technical limits (a sufficiently sophisticated attacker with rooted hardware can defeat OS-level mock-location flags) — accepted residual risk, mitigated by defense-in-depth (behavioral + statistical layers above), not treated as fully solvable.
- Formal penetration testing and a third-party security review are recommended before public launch (tracked in Deployment Strategy / Risk Analysis).
