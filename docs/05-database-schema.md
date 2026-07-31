# Database Schema

**Status:** v1.1 — Phase 1, extended with the Data Quality, Feature Management, Configuration, and Fare Policy platforms (see `18-platform-extensions.md`) before Phase 2.
**Engine:** PostgreSQL 16+ with PostGIS 3.4+

## 1. Schema Organization

One Postgres **schema per bounded context**, matching the modular-monolith module boundaries (Architecture §1). Cross-schema foreign keys are permitted (single database at MVP) but application code in one module must never issue raw SQL against another module's schema — access only through that module's repository interface. This keeps the seam ready for physical database-per-service separation later. **Ten schemas now** (three added by this revision: `farepolicy`, `feature`, `dataquality`).

| Schema | Owning Module |
|---|---|
| `identity` | Identity & Auth |
| `trip` | Trip Platform |
| `farepolicy` | Fare Policy Engine *(NEW — ADR-0021)* |
| `trust` | Trust Platform |
| `reward` | Rewards Platform |
| `advertising` | Advertising Platform |
| `dataquality` | Data Quality Platform *(NEW — ADR-0019)* |
| `config` | Configuration Platform |
| `feature` | Feature Management Platform *(NEW — ADR-0018)* |
| `admin` | Administration / Audit |
| `platform` | Cross-cutting infrastructure (transactional outbox, provenance log — ADR-0011, ADR-0022) |

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS trip;
CREATE SCHEMA IF NOT EXISTS farepolicy;
CREATE SCHEMA IF NOT EXISTS trust;
CREATE SCHEMA IF NOT EXISTS reward;
CREATE SCHEMA IF NOT EXISTS advertising;
CREATE SCHEMA IF NOT EXISTS dataquality;
CREATE SCHEMA IF NOT EXISTS config;
CREATE SCHEMA IF NOT EXISTS feature;
CREATE SCHEMA IF NOT EXISTS admin;
CREATE SCHEMA IF NOT EXISTS platform;
```

### 1.1 Transactional Outbox & Provenance Log (`platform` schema — ADR-0011, ADR-0022)

Every module that publishes a domain event writes it here, in the **same transaction** as the state change that produced it. A relay worker polls `dispatched_at IS NULL ORDER BY created_at`, delivers to consumers, and marks rows dispatched — in-process at MVP, swappable for a real broker/CDC relay later without changing this table's contract.

```sql
CREATE TABLE platform.outbox (
    id             BIGSERIAL PRIMARY KEY,
    event_type     TEXT NOT NULL,          -- e.g. 'TripCompleted', 'TripVerified', 'DataQualityAssessed'
    aggregate_type TEXT NOT NULL,          -- e.g. 'Trip'
    aggregate_id   UUID NOT NULL,
    payload        JSONB NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    dispatched_at  TIMESTAMPTZ,
    attempts       INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_outbox_undispatched ON platform.outbox (created_at) WHERE dispatched_at IS NULL;
```

Consumers must be idempotent per `(event_type, aggregate_id)` since delivery is at-least-once. **`TripCompleted` now fans out to two independent consumers — Trust and Data Quality (ADR-0019) — both idempotent, neither blocking the other.**

**Provenance log (added, ADR-0022):** every write or correction of a provenance-bearing value (estimated fare, traffic estimate, trust score, data quality score, reward grant) is additionally recorded here, so a value's full history survives even a later Manual Review "Corrected" action — the inline JSONB provenance column on each table only ever holds the *current* provenance, this table holds all of them.

```sql
CREATE TABLE platform.provenance_log (
    id              BIGSERIAL PRIMARY KEY,
    entity_type     TEXT NOT NULL,    -- e.g. 'Trip.estimatedFare', 'TripTrustAssessment.trustScore'
    entity_id       UUID NOT NULL,
    value           JSONB NOT NULL,
    source          TEXT NOT NULL,    -- e.g. 'FARE_FORMULA', 'MANUAL_OVERRIDE', 'TRUST_ENGINE'
    source_version  TEXT NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_provenance_entity ON platform.provenance_log (entity_type, entity_id);
```

## 2. `config` Schema (Configuration Platform)

Every aggregate here follows the same versioned shape (ADR-0017): append-only, `status` (`DRAFT`/`ACTIVE`/`SUPERSEDED`), `effective_from`-resolved "current" version, every publish audit-logged via `admin.audit_log_entry`, rollback modeled as a new version copying a prior one's values (`rolled_back_from`).

```sql
CREATE TABLE config.city (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    country      TEXT NOT NULL DEFAULT 'Egypt',
    bounds       GEOMETRY(POLYGON, 4326) NOT NULL,
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_city_bounds ON config.city USING GIST (bounds);

CREATE TABLE config.trust_threshold_config (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id              UUID NOT NULL REFERENCES config.city(id),
    min_verified_score   INT NOT NULL CHECK (min_verified_score BETWEEN 0 AND 100),
    signal_weights       JSONB NOT NULL,
    status               TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','SUPERSEDED')),
    effective_from       TIMESTAMPTZ NOT NULL,
    rolled_back_from      UUID REFERENCES config.trust_threshold_config(id),
    created_by_admin_id   UUID REFERENCES admin.admin_user(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_trust_config_city_effective ON config.trust_threshold_config (city_id, effective_from DESC);

-- REVISED (Platform Extensions §3.2): tiering_rules renamed to reward_multiplier_rules for
-- clarity; daily_point_limit added (Configuration inventory requirement: "Daily Reward Limits").
CREATE TABLE config.reward_rule_config (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id                   UUID NOT NULL REFERENCES config.city(id),
    points_per_verified_trip  INT NOT NULL,
    reward_multiplier_rules   JSONB NOT NULL DEFAULT '{}'::jsonb,
    daily_point_limit         INT,   -- NULL = unlimited
    status                    TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','SUPERSEDED')),
    effective_from            TIMESTAMPTZ NOT NULL,
    rolled_back_from           UUID REFERENCES config.reward_rule_config(id),
    created_by_admin_id        UUID REFERENCES admin.admin_user(id),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reward_config_city_effective ON config.reward_rule_config (city_id, effective_from DESC);

-- NEW (Configuration inventory: "GPS Thresholds"). Shared input to both Trust's and Data
-- Quality's GPS-related evaluators (ADR-0019) — one config, two independent consumers.
CREATE TABLE config.gps_threshold_config (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id                   UUID NOT NULL REFERENCES config.city(id),
    min_accuracy_meters       NUMERIC(6,2) NOT NULL,
    max_plausible_speed_mps   NUMERIC(6,2) NOT NULL,
    max_ping_gap_seconds      INT NOT NULL,
    status                    TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','SUPERSEDED')),
    effective_from            TIMESTAMPTZ NOT NULL,
    rolled_back_from           UUID REFERENCES config.gps_threshold_config(id),
    created_by_admin_id        UUID REFERENCES admin.admin_user(id),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gps_threshold_city_effective ON config.gps_threshold_config (city_id, effective_from DESC);

-- NEW (Configuration inventory: "Fraud Thresholds"). Input to Trust's FraudPatternDetector
-- (aggregate rider-behavior signals, distinct from per-trip min_verified_score above).
CREATE TABLE config.fraud_threshold_config (
    id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id                        UUID NOT NULL REFERENCES config.city(id),
    max_verified_trips_per_day     INT NOT NULL,
    min_trip_interval_seconds      INT NOT NULL,
    duplicate_trip_window_minutes  INT NOT NULL,
    status                         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','SUPERSEDED')),
    effective_from                 TIMESTAMPTZ NOT NULL,
    rolled_back_from                UUID REFERENCES config.fraud_threshold_config(id),
    created_by_admin_id             UUID REFERENCES admin.admin_user(id),
    created_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fraud_threshold_city_effective ON config.fraud_threshold_config (city_id, effective_from DESC);

-- NEW (Configuration inventory: "Advertisement Radius", "Campaign Priority" defaults).
CREATE TABLE config.advertising_target_config (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id                 UUID NOT NULL REFERENCES config.city(id),
    default_radius_meters   INT NOT NULL,
    max_active_per_bucket   INT NOT NULL,
    priority_tie_break_rule TEXT NOT NULL DEFAULT 'CREATED_AT_ASC',
    status                  TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','SUPERSEDED')),
    effective_from          TIMESTAMPTZ NOT NULL,
    rolled_back_from         UUID REFERENCES config.advertising_target_config(id),
    created_by_admin_id      UUID REFERENCES admin.admin_user(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ad_target_config_city_effective ON config.advertising_target_config (city_id, effective_from DESC);

-- NEW (Configuration inventory: "Rate Limits"). Makes the distributed rate limiter (ADR-0013)
-- admin-tunable rather than a hardcoded constant in middleware.
CREATE TABLE config.rate_limit_config (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope            TEXT NOT NULL,   -- 'OTP_REQUEST' | 'TRIP_CREATE' | 'GPS_INGEST' | 'AD_SERVE'
    max_requests     INT NOT NULL,
    window_seconds   INT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','SUPERSEDED')),
    effective_from   TIMESTAMPTZ NOT NULL,
    rolled_back_from  UUID REFERENCES config.rate_limit_config(id),
    created_by_admin_id UUID REFERENCES admin.admin_user(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rate_limit_scope_effective ON config.rate_limit_config (scope, effective_from DESC);

-- NEW: Data Quality Platform's own tunable thresholds/weights (component weighting,
-- READY_FOR_AI / LOW_QUALITY score cutoffs) — see dataquality schema §6.
CREATE TABLE config.data_quality_threshold_config (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id                  UUID NOT NULL REFERENCES config.city(id),
    component_weights        JSONB NOT NULL,   -- { "gps":0.3,"route":0.2,"fare":0.2,"userInput":0.15,"deviceSignals":0.15 }
    ready_for_ai_min_score   NUMERIC(5,2) NOT NULL,
    low_quality_max_score    NUMERIC(5,2) NOT NULL,
    status                   TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','SUPERSEDED')),
    effective_from           TIMESTAMPTZ NOT NULL,
    rolled_back_from          UUID REFERENCES config.data_quality_threshold_config(id),
    created_by_admin_id       UUID REFERENCES admin.admin_user(id),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dq_threshold_city_effective ON config.data_quality_threshold_config (city_id, effective_from DESC);
```

**Note:** `config.fare_rule_set` (Phase 1's original fare-rule table) is **retired** — fare policy now lives in `farepolicy.fare_policy_version` (§3), which has real independent domain complexity (tiered distance rules, waiting rules, government references) that outgrew a generic config row. `config.feature_flag` is likewise retired in favor of the richer `feature` schema (§7) — a bare boolean can no longer express percentage rollouts, segments, or experiments.

## 3. `farepolicy` Schema (Fare Policy Engine — NEW, ADR-0021)

```sql
CREATE TABLE farepolicy.fare_policy_version (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id               UUID NOT NULL REFERENCES config.city(id),
    version_label         TEXT NOT NULL,             -- human-referenceable, e.g. 'ALX-2026-A'
    government_reference  TEXT,                       -- optional citation to an official tariff
    base_fare             NUMERIC(10,2) NOT NULL,
    distance_rules        JSONB NOT NULL,             -- tiered per-km brackets, not a flat rate
    waiting_rules         JSONB NOT NULL DEFAULT '{}'::jsonb,   -- per-minute charge + free grace period
    time_of_day_rules     JSONB NOT NULL DEFAULT '{}'::jsonb,   -- multipliers by hour bucket/day type
    special_adjustments   JSONB NOT NULL DEFAULT '{}'::jsonb,   -- named surcharges (airport, night, holiday)
    status                TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','SUPERSEDED')),
    effective_from        TIMESTAMPTZ NOT NULL,
    rolled_back_from       UUID REFERENCES farepolicy.fare_policy_version(id),
    created_by_admin_id    UUID REFERENCES admin.admin_user(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fare_policy_city_effective ON farepolicy.fare_policy_version (city_id, effective_from DESC);
```

Reproducibility: every historical `trip.trip.fare_policy_version_id` (§4) points at the exact row above used to price it — replaying `FarePolicyEngine.computeFareRange` against that row and the trip's stored distance/duration/traffic-signal values must reproduce the stored estimate exactly (ADR-0021).

## 4. `identity` Schema

```sql
CREATE TABLE identity.rider (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind             TEXT NOT NULL CHECK (kind IN ('GUEST','REGISTERED')),
    device_anon_id   UUID NOT NULL,
    display_name     TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    registered_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_rider_device_anon ON identity.rider (device_anon_id);

CREATE TABLE identity.auth_identity (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id          UUID NOT NULL REFERENCES identity.rider(id) ON DELETE CASCADE,
    provider          TEXT NOT NULL CHECK (provider IN ('OTP_PHONE','GOOGLE','APPLE')),
    provider_subject  TEXT NOT NULL,
    phone_number_hash TEXT,
    linked_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_subject)
);
CREATE INDEX idx_auth_identity_rider ON identity.auth_identity (rider_id);
```

*PII note:* raw phone numbers/emails, if stored at all, live only in this schema (hashed/encrypted at rest per Security Model); no other schema stores anything beyond `rider_id`.

## 5. `trip` Schema

```sql
-- REVISED (ADR-0021, ADR-0022): fare_rule_set_id renamed/repointed to fare_policy_version_id;
-- provenance columns added for estimated fare and traffic estimate.
CREATE TABLE trip.trip (
    id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id                      UUID NOT NULL REFERENCES identity.rider(id),
    city_id                       UUID NOT NULL REFERENCES config.city(id),
    origin                        GEOMETRY(POINT, 4326) NOT NULL,
    destination                   GEOMETRY(POINT, 4326) NOT NULL,
    status                        TEXT NOT NULL CHECK (status IN ('ESTIMATED','ACTIVE','COMPLETED','CANCELLED')),
    estimated_fare_min            NUMERIC(10,2) NOT NULL,
    estimated_fare_max            NUMERIC(10,2) NOT NULL,
    estimated_fare_provenance     JSONB NOT NULL,   -- { source, producedByVersion, computedAt } — ADR-0022
    traffic_estimate_provenance   JSONB NOT NULL,   -- { source, producedByVersion, computedAt } — ADR-0022
    actual_fare                   NUMERIC(10,2),
    route                         GEOMETRY(LINESTRING, 4326),
    distance_meters               INT,
    estimated_duration_seconds    INT,
    fare_policy_version_id        UUID NOT NULL REFERENCES farepolicy.fare_policy_version(id),
    started_at                    TIMESTAMPTZ,
    completed_at                  TIMESTAMPTZ,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_actual_fare_only_when_completed
        CHECK (actual_fare IS NULL OR status = 'COMPLETED')
);
CREATE INDEX idx_trip_rider ON trip.trip (rider_id);
CREATE INDEX idx_trip_city_status ON trip.trip (city_id, status);
CREATE INDEX idx_trip_origin ON trip.trip USING GIST (origin);
CREATE INDEX idx_trip_destination ON trip.trip USING GIST (destination);
CREATE INDEX idx_trip_route ON trip.trip USING GIST (route);
CREATE INDEX idx_trip_completed_at ON trip.trip (completed_at) WHERE status = 'COMPLETED';

-- Append-only; application layer must never UPDATE/DELETE rows here.
-- REVISED on architecture review (ADR-0015): no per-row spatial index (no query performs
-- spatial containment over individual pings — all access is per-trip, time-ordered), monthly
-- range partitioning on recorded_at from the first migration (not retrofitted later), a
-- server-stamped received_at for client-timestamp cross-checking, and a client-generated
-- ping ID for idempotent batched-flush ingestion.
CREATE TABLE trip.gps_ping (
    id              BIGSERIAL,
    trip_id         UUID NOT NULL REFERENCES trip.trip(id) ON DELETE CASCADE,
    client_ping_id  UUID NOT NULL,
    location        GEOMETRY(POINT, 4326) NOT NULL,
    accuracy_m      NUMERIC(6,2),
    speed_mps       NUMERIC(6,2),
    recorded_at     TIMESTAMPTZ NOT NULL,       -- client-claimed capture time
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now(), -- server-observed arrival time
    PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- Composite time-ordered index is the primary access path (WHERE trip_id = ? ORDER BY recorded_at).
CREATE INDEX idx_gps_ping_trip_time ON trip.gps_ping (trip_id, recorded_at);
CREATE UNIQUE INDEX idx_gps_ping_idempotency ON trip.gps_ping (trip_id, client_ping_id);

-- Monthly partitions created ahead of need by a scheduled maintenance job, e.g.:
-- CREATE TABLE trip.gps_ping_2026_08 PARTITION OF trip.gps_ping
--     FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

-- Large divergence between (recorded_at) and (received_at) is a Trust/Data-Quality input
-- (client clocks are not a trusted source for fraud- or quality-relevant timing).
```

## 6. `trust` Schema

```sql
-- REVISED (ADR-0022): rule_set_version clarified as the CONFIG version (trust_config_id is the
-- authoritative FK); engine_version added as the CODE version — both are required to reproduce
-- a historical verdict exactly, since config and scoring logic can each change independently.
CREATE TABLE trust.trip_trust_assessment (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id           UUID NOT NULL UNIQUE REFERENCES trip.trip(id),
    trust_score       INT NOT NULL CHECK (trust_score BETWEEN 0 AND 100),
    verdict           TEXT NOT NULL CHECK (verdict IN ('VERIFIED','REJECTED','FLAGGED_FOR_REVIEW')),
    trust_config_id   UUID NOT NULL REFERENCES config.trust_threshold_config(id),
    engine_version    TEXT NOT NULL,
    evaluated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_trust_assessment_verdict ON trust.trip_trust_assessment (verdict);

CREATE TABLE trust.trust_signal_result (
    id             BIGSERIAL PRIMARY KEY,
    assessment_id  UUID NOT NULL REFERENCES trust.trip_trust_assessment(id) ON DELETE CASCADE,
    signal_name    TEXT NOT NULL,
    score          NUMERIC(5,2) NOT NULL,
    weight         NUMERIC(5,2) NOT NULL,
    detail         JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_trust_signal_assessment ON trust.trust_signal_result (assessment_id);
```

**Relocation note (ADR-0019):** `trust.trip_feature_snapshot` — added in a prior review pass as a stopgap ML-readiness measure before Data Quality existed as a context — has **moved to `dataquality.trip_feature_snapshot`** (§8). Trust no longer owns any ML-readiness data structure; it owns only fraud/reward-eligibility scoring.

## 7. `reward` Schema

```sql
-- points_balance is a denormalized read cache, never an independent source of truth (ADR-0016).
-- Every write to it happens inside the same transaction that inserts the corresponding
-- reward_ledger_entry, computed as SUM(ledger entries) for that wallet.
CREATE TABLE reward.reward_wallet (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id        UUID NOT NULL UNIQUE REFERENCES identity.rider(id),
    points_balance  INT NOT NULL DEFAULT 0 CHECK (points_balance >= 0)
);

CREATE TABLE reward.merchant (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id     UUID NOT NULL REFERENCES config.city(id),
    name        TEXT NOT NULL,
    category    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reward.reward_offer (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id    UUID NOT NULL REFERENCES reward.merchant(id),
    provider_key   TEXT NOT NULL DEFAULT 'INTERNAL', -- pluggable RewardProvider adapter identifier
    title          TEXT NOT NULL,
    points_cost    INT NOT NULL CHECK (points_cost > 0),
    valid_from     TIMESTAMPTZ NOT NULL,
    valid_to       TIMESTAMPTZ NOT NULL,
    active         BOOLEAN NOT NULL DEFAULT TRUE
);

-- REVISED (ADR-0022): reward_rule_config_id added — every EARN entry references the exact
-- reward policy version that produced its point amount, closing a Phase-1 reproducibility gap.
CREATE TABLE reward.reward_ledger_entry (
    id                     BIGSERIAL PRIMARY KEY,
    wallet_id              UUID NOT NULL REFERENCES reward.reward_wallet(id),
    type                   TEXT NOT NULL CHECK (type IN ('EARN','REDEEM')),
    points                 INT NOT NULL,
    source_trip_id         UUID REFERENCES trip.trip(id),
    reward_offer_id        UUID REFERENCES reward.reward_offer(id),
    reward_rule_config_id  UUID REFERENCES config.reward_rule_config(id),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_earn_has_trip CHECK (type <> 'EARN' OR source_trip_id IS NOT NULL),
    CONSTRAINT chk_redeem_has_offer CHECK (type <> 'REDEEM' OR reward_offer_id IS NOT NULL),
    CONSTRAINT chk_earn_has_rule_config CHECK (type <> 'EARN' OR reward_rule_config_id IS NOT NULL)
);
CREATE INDEX idx_ledger_wallet ON reward.reward_ledger_entry (wallet_id, created_at);
CREATE UNIQUE INDEX idx_ledger_one_earn_per_trip ON reward.reward_ledger_entry (source_trip_id) WHERE type = 'EARN';
```

## 8. `dataquality` Schema (Data Quality Platform — NEW, ADR-0019, ADR-0020)

```sql
CREATE TABLE dataquality.data_quality_assessment (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id               UUID NOT NULL UNIQUE REFERENCES trip.trip(id),
    gps_score             NUMERIC(5,2) NOT NULL,
    route_score           NUMERIC(5,2) NOT NULL,
    fare_score            NUMERIC(5,2) NOT NULL,
    user_input_score      NUMERIC(5,2) NOT NULL,
    device_signal_score   NUMERIC(5,2) NOT NULL,
    overall_score         NUMERIC(5,2) NOT NULL,
    readiness_status      TEXT NOT NULL CHECK (readiness_status IN
                             ('READY_FOR_AI','LOW_QUALITY','MISSING_DATA','SUSPICIOUS','UNDER_REVIEW')),
    quality_config_id     UUID NOT NULL REFERENCES config.data_quality_threshold_config(id),
    engine_version        TEXT NOT NULL,
    evaluated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dq_assessment_readiness ON dataquality.data_quality_assessment (readiness_status);

CREATE TABLE dataquality.data_quality_component_score (
    id             BIGSERIAL PRIMARY KEY,
    assessment_id  UUID NOT NULL REFERENCES dataquality.data_quality_assessment(id) ON DELETE CASCADE,
    component_name TEXT NOT NULL CHECK (component_name IN ('GPS','ROUTE','FARE','USER_INPUT','DEVICE_SIGNALS')),
    score          NUMERIC(5,2) NOT NULL,
    weight         NUMERIC(5,2) NOT NULL,
    detail         JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_dq_component_assessment ON dataquality.data_quality_component_score (assessment_id);

-- Relocated from trust schema (ADR-0019): Data Quality, not Trust, is the correct long-term
-- owner of ML-readiness feature data.
CREATE TABLE dataquality.trip_feature_snapshot (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id               UUID NOT NULL UNIQUE REFERENCES trip.trip(id),
    distance_meters       INT NOT NULL,
    duration_seconds      INT NOT NULL,
    avg_speed_mps         NUMERIC(6,2),
    max_speed_mps         NUMERIC(6,2),
    stop_count            INT NOT NULL DEFAULT 0,
    route_deviation_ratio NUMERIC(6,3),
    time_of_day_bucket    TEXT,
    day_of_week           SMALLINT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Manual Review Queue (ADR-0020). Distinct from trust's own FLAGGED_FOR_REVIEW queue — this
-- resolves dataset-readiness questions, not reward-eligibility questions.
CREATE TABLE dataquality.data_review_case (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id               UUID NOT NULL REFERENCES trip.trip(id),
    assessment_id         UUID NOT NULL REFERENCES dataquality.data_quality_assessment(id),
    state                 TEXT NOT NULL CHECK (state IN
                             ('PENDING_REVIEW','APPROVED','REJECTED','MERGED','CORRECTED','ESCALATED')),
    assigned_admin_id     UUID REFERENCES admin.admin_user(id),
    merged_into_trip_id   UUID REFERENCES trip.trip(id),   -- populated only when state = MERGED
    opened_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at           TIMESTAMPTZ
);
CREATE INDEX idx_review_case_state ON dataquality.data_review_case (state);
CREATE UNIQUE INDEX idx_review_case_one_open_per_trip ON dataquality.data_review_case (trip_id)
    WHERE state = 'PENDING_REVIEW';

-- Append-only case history (state transitions + reviewer notes) — same audit discipline as
-- admin.audit_log_entry, scoped to this workflow so a case's history is queryable directly.
CREATE TABLE dataquality.data_review_case_event (
    id           BIGSERIAL PRIMARY KEY,
    case_id      UUID NOT NULL REFERENCES dataquality.data_review_case(id) ON DELETE CASCADE,
    from_state   TEXT,
    to_state     TEXT NOT NULL,
    admin_id     UUID REFERENCES admin.admin_user(id),
    note         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_review_event_case ON dataquality.data_review_case_event (case_id, created_at);

-- Structural guarantee (mirrors ADR-0008's Trust/Reward firewall): the ONLY sanctioned read
-- path for future ML training/export jobs. A pipeline reading raw trip/gps_ping tables
-- directly instead of this view is not using the sanctioned path.
CREATE VIEW dataquality.ml_ready_trip_dataset AS
SELECT
    t.id AS trip_id,
    dqa.overall_score, dqa.gps_score, dqa.route_score, dqa.fare_score,
    dqa.user_input_score, dqa.device_signal_score, dqa.engine_version AS quality_engine_version,
    tfs.distance_meters, tfs.duration_seconds, tfs.avg_speed_mps, tfs.max_speed_mps,
    tfs.stop_count, tfs.route_deviation_ratio, tfs.time_of_day_bucket, tfs.day_of_week
FROM trip.trip t
JOIN dataquality.data_quality_assessment dqa ON dqa.trip_id = t.id
JOIN dataquality.trip_feature_snapshot tfs ON tfs.trip_id = t.id
WHERE dqa.readiness_status = 'READY_FOR_AI';
```

## 9. `feature` Schema (Feature Management Platform — NEW, ADR-0018)

```sql
CREATE TABLE feature.feature_segment (
    key          TEXT PRIMARY KEY,     -- e.g. 'internal_testers', 'high_trust_riders'
    description  TEXT,
    rule         JSONB NOT NULL,       -- declarative membership rule (rider attributes or allowlist)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE feature.feature_flag (
    key                  TEXT PRIMARY KEY,
    description          TEXT,
    kind                 TEXT NOT NULL CHECK (kind IN ('TOGGLE','PERCENTAGE_ROLLOUT','KILL_SWITCH','EXPERIMENT')),
    enabled              BOOLEAN NOT NULL DEFAULT FALSE,
    rollout_percentage   SMALLINT CHECK (rollout_percentage BETWEEN 0 AND 100),
    environment          TEXT NOT NULL DEFAULT 'ALL' CHECK (environment IN ('ALL','LOCAL','STAGING','PRODUCTION')),
    city_id              UUID REFERENCES config.city(id),           -- NULL = all cities
    segment_key          TEXT REFERENCES feature.feature_segment(key), -- NULL = all riders
    is_kill_switch       BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by_admin_id  UUID REFERENCES admin.admin_user(id),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE feature.feature_experiment (
    key          TEXT PRIMARY KEY,     -- e.g. 'fare_range_display_v2'
    description  TEXT,
    variants     JSONB NOT NULL,       -- [{ "key":"control","weight":50 }, { "key":"treatment","weight":50 }]
    status       TEXT NOT NULL CHECK (status IN ('DRAFT','RUNNING','PAUSED','CONCLUDED')),
    started_at   TIMESTAMPTZ,
    ended_at     TIMESTAMPTZ
);

-- Append-only, first-exposure-sticky (unique index) exposure tracking for experiment analysis.
CREATE TABLE feature.feature_exposure_log (
    id             BIGSERIAL PRIMARY KEY,
    experiment_key TEXT NOT NULL REFERENCES feature.feature_experiment(key),
    rider_id       UUID NOT NULL REFERENCES identity.rider(id),
    variant_key    TEXT NOT NULL,
    exposed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_exposure_once ON feature.feature_exposure_log (experiment_key, rider_id);
```

**Resolution note:** percentage rollout and experiment-variant assignment are **stateless and deterministic** (`hash(riderId or deviceAnonId, key) % 100`) — no per-rider assignment row is stored for plain rollouts; `feature_exposure_log` exists specifically for experiments, where recording *which variant a rider was actually exposed to* matters for analysis. See ADR-0018.

## 10. `advertising` Schema

```sql
CREATE TABLE advertising.campaign (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id   UUID NOT NULL REFERENCES reward.merchant(id),
    city_id       UUID NOT NULL REFERENCES config.city(id),
    name          TEXT NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('DRAFT','ACTIVE','PAUSED','EXHAUSTED','ENDED')),
    priority      INT NOT NULL DEFAULT 0,
    budget_limit  NUMERIC(12,2) NOT NULL,
    budget_spent  NUMERIC(12,2) NOT NULL DEFAULT 0,
    start_at      TIMESTAMPTZ NOT NULL,
    end_at        TIMESTAMPTZ NOT NULL,
    dayparting    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaign_city_status ON advertising.campaign (city_id, status);

CREATE TABLE advertising.geofence (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id   UUID NOT NULL REFERENCES advertising.campaign(id) ON DELETE CASCADE,
    target_type   TEXT NOT NULL CHECK (target_type IN ('GEOFENCE','ROUTE_CORRIDOR','RADIUS')),
    area          GEOMETRY(GEOMETRY, 4326) NOT NULL,
    radius_meters INT
);
CREATE INDEX idx_geofence_area ON advertising.geofence USING GIST (area);

CREATE TABLE advertising.ad_impression (
    id            BIGSERIAL PRIMARY KEY,
    campaign_id   UUID NOT NULL REFERENCES advertising.campaign(id),
    trip_id       UUID REFERENCES trip.trip(id),
    rider_id      UUID NOT NULL REFERENCES identity.rider(id),
    served_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    context       JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_impression_campaign ON advertising.ad_impression (campaign_id, served_at);

CREATE TABLE advertising.ad_click (
    id             BIGSERIAL PRIMARY KEY,
    impression_id  BIGINT NOT NULL REFERENCES advertising.ad_impression(id),
    clicked_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 11. `admin` Schema

**Migration-order note:** although presented last for readability, `admin.admin_user` migrates **first** of all schemas — every versioned-config table across `config`, `farepolicy`, and `feature` carries a `created_by_admin_id`/`updated_by_admin_id` FK to it (see Design Notes §12).

```sql
CREATE TABLE admin.admin_user (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT NOT NULL UNIQUE,
    role        TEXT NOT NULL, -- see Security Model RBAC roles
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Immutable, append-only audit trail for every admin write action across all contexts,
-- including every versioned-config publish/rollback (ADR-0017) across config/farepolicy/feature.
CREATE TABLE admin.audit_log_entry (
    id             BIGSERIAL PRIMARY KEY,
    admin_user_id  UUID NOT NULL REFERENCES admin.admin_user(id),
    action         TEXT NOT NULL,
    entity_type    TEXT NOT NULL,
    entity_id      TEXT NOT NULL,
    before         JSONB,
    after          JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON admin.audit_log_entry (entity_type, entity_id);
CREATE INDEX idx_audit_admin_user ON admin.audit_log_entry (admin_user_id, created_at);
```

## 12. Design Notes

- **Append-only tables** (`gps_ping`, `reward_ledger_entry`, `audit_log_entry`, `ad_impression`, `ad_click`, `outbox` after dispatch, `provenance_log`, `data_review_case_event`, `feature_exposure_log`, and all versioned `config.*`/`farepolicy.*` tables): enforced at the application layer (repository methods expose only `insert`/`select`) and reinforced with `REVOKE UPDATE, DELETE` at the DB role level for the application's runtime user, with a separate, audited migration-only role for exceptional corrections.
- **Money** stored as `NUMERIC(10,2)` (EGP), never floating point.
- **Geospatial** columns use SRID 4326 (WGS84), consistent with GPS/OSM data; GiST indexes on geometry columns are added only where a query actually performs spatial containment/proximity search (`trip.origin`/`destination`/`route`, `advertising.geofence.area`) — **not** on `gps_ping.location`, which is accessed exclusively per-trip/time-ordered, never spatially (ADR-0015).
- **Partitioning is a decided, not deferred, design choice for `trip.gps_ping`**: monthly range partitions on `recorded_at` from the first migration (ADR-0015).
- **Versioned configuration** (`config.*`, `farepolicy.fare_policy_version`) follows one shared pattern (ADR-0017): append-only, `status`, `effective_from`, `rolled_back_from`, and an `admin.audit_log_entry` write on every publish — implemented as one shared repository/service pattern in code, not copy-pasted per table.
- **Migrations** managed via a single migration tool (TypeORM/Prisma/Knex migrations, decided in Phase 2) with one migration history per schema, run in dependency order: `admin` (at minimum `admin_user`, bootstrapped first since `config`/`farepolicy`/`feature` versioned tables all carry a `created_by_admin_id`/`updated_by_admin_id` FK to it) → `config` → `identity` → `farepolicy` → `trip` → `trust`, `reward` → `advertising` → `dataquality` → `feature` → `platform`. (`farepolicy` must precede `trip` since `trip.trip.fare_policy_version_id` references it; `dataquality` must follow `trip` and `trust` since it references both.)
- **Concurrency-sensitive writes** (reward wallet balance, ADR-0016) are computed transactionally from their source ledger inside the same transaction as the write that changes them — never read-then-write across two statements without a transactional/locking guard.
- **Provenance** (ADR-0022): every table listed in Platform Extensions §1.3 carries an inline JSONB provenance column for its current value, plus a `platform.provenance_log` row per write/correction — this is a code-review-enforced convention (Coding Standards, amended) for any new computed value feeding a downstream decision, not a framework-enforced constraint.
