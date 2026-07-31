# Database Schema

**Status:** Draft v1.0 — Phase 1
**Engine:** PostgreSQL 16+ with PostGIS 3.4+

## 1. Schema Organization

One Postgres **schema per bounded context**, matching the modular-monolith module boundaries (Architecture §1). Cross-schema foreign keys are permitted (single database at MVP) but application code in one module must never issue raw SQL against another module's schema — access only through that module's repository interface. This keeps the seam ready for physical database-per-service separation later.

| Schema | Owning Module |
|---|---|
| `identity` | Identity & Auth |
| `trip` | Trip Platform |
| `trust` | Trust Platform |
| `reward` | Rewards Platform |
| `advertising` | Advertising Platform |
| `config` | Configuration |
| `admin` | Administration / Audit |

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS trip;
CREATE SCHEMA IF NOT EXISTS trust;
CREATE SCHEMA IF NOT EXISTS reward;
CREATE SCHEMA IF NOT EXISTS advertising;
CREATE SCHEMA IF NOT EXISTS config;
CREATE SCHEMA IF NOT EXISTS admin;
```

## 2. `config` Schema

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

-- Versioned, append-only. Never UPDATE effective rows; insert a new version.
CREATE TABLE config.fare_rule_set (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id                  UUID NOT NULL REFERENCES config.city(id),
    base_fare                NUMERIC(10,2) NOT NULL,
    per_km_rate              NUMERIC(10,2) NOT NULL,
    per_minute_rate          NUMERIC(10,2) NOT NULL DEFAULT 0,
    time_of_day_multipliers  JSONB NOT NULL DEFAULT '{}'::jsonb,
    waiting_charge_per_min   NUMERIC(10,2) NOT NULL DEFAULT 0,
    effective_from           TIMESTAMPTZ NOT NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fare_rule_city_effective ON config.fare_rule_set (city_id, effective_from DESC);

CREATE TABLE config.trust_threshold_config (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id              UUID NOT NULL REFERENCES config.city(id),
    min_verified_score   INT NOT NULL CHECK (min_verified_score BETWEEN 0 AND 100),
    signal_weights       JSONB NOT NULL,
    effective_from       TIMESTAMPTZ NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_trust_config_city_effective ON config.trust_threshold_config (city_id, effective_from DESC);

CREATE TABLE config.reward_rule_config (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id              UUID NOT NULL REFERENCES config.city(id),
    points_per_verified_trip INT NOT NULL,
    tiering_rules        JSONB NOT NULL DEFAULT '{}'::jsonb,
    effective_from       TIMESTAMPTZ NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reward_config_city_effective ON config.reward_rule_config (city_id, effective_from DESC);

CREATE TABLE config.feature_flag (
    key          TEXT PRIMARY KEY,
    enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    description  TEXT,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 3. `identity` Schema

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

## 4. `trip` Schema

```sql
CREATE TABLE trip.trip (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id                    UUID NOT NULL REFERENCES identity.rider(id),
    city_id                     UUID NOT NULL REFERENCES config.city(id),
    origin                      GEOMETRY(POINT, 4326) NOT NULL,
    destination                 GEOMETRY(POINT, 4326) NOT NULL,
    status                      TEXT NOT NULL CHECK (status IN ('ESTIMATED','ACTIVE','COMPLETED','CANCELLED')),
    estimated_fare_min          NUMERIC(10,2) NOT NULL,
    estimated_fare_max          NUMERIC(10,2) NOT NULL,
    actual_fare                 NUMERIC(10,2),
    route                       GEOMETRY(LINESTRING, 4326),
    distance_meters             INT,
    estimated_duration_seconds  INT,
    fare_rule_set_id            UUID NOT NULL REFERENCES config.fare_rule_set(id),
    started_at                  TIMESTAMPTZ,
    completed_at                TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
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
CREATE TABLE trip.gps_ping (
    id           BIGSERIAL PRIMARY KEY,
    trip_id      UUID NOT NULL REFERENCES trip.trip(id) ON DELETE CASCADE,
    location     GEOMETRY(POINT, 4326) NOT NULL,
    accuracy_m   NUMERIC(6,2),
    speed_mps    NUMERIC(6,2),
    recorded_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_gps_ping_trip ON trip.gps_ping (trip_id, recorded_at);
CREATE INDEX idx_gps_ping_location ON trip.gps_ping USING GIST (location);

-- Partitioning: gps_ping and trip are the highest-volume tables.
-- Recommend range partitioning by month on recorded_at/created_at once volume warrants (see Scalability Plan).
```

## 5. `trust` Schema

```sql
CREATE TABLE trust.trip_trust_assessment (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id           UUID NOT NULL UNIQUE REFERENCES trip.trip(id),
    trust_score       INT NOT NULL CHECK (trust_score BETWEEN 0 AND 100),
    verdict           TEXT NOT NULL CHECK (verdict IN ('VERIFIED','REJECTED','FLAGGED_FOR_REVIEW')),
    trust_config_id   UUID NOT NULL REFERENCES config.trust_threshold_config(id),
    rule_set_version  TEXT NOT NULL,
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

## 6. `reward` Schema

```sql
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

-- Append-only ledger; points_balance is a maintained projection, never the source of truth.
CREATE TABLE reward.reward_ledger_entry (
    id               BIGSERIAL PRIMARY KEY,
    wallet_id        UUID NOT NULL REFERENCES reward.reward_wallet(id),
    type             TEXT NOT NULL CHECK (type IN ('EARN','REDEEM')),
    points           INT NOT NULL,
    source_trip_id   UUID REFERENCES trip.trip(id),
    reward_offer_id  UUID REFERENCES reward.reward_offer(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_earn_has_trip CHECK (type <> 'EARN' OR source_trip_id IS NOT NULL),
    CONSTRAINT chk_redeem_has_offer CHECK (type <> 'REDEEM' OR reward_offer_id IS NOT NULL)
);
CREATE INDEX idx_ledger_wallet ON reward.reward_ledger_entry (wallet_id, created_at);
CREATE UNIQUE INDEX idx_ledger_one_earn_per_trip ON reward.reward_ledger_entry (source_trip_id) WHERE type = 'EARN';
```

## 7. `advertising` Schema

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

## 8. `admin` Schema

```sql
CREATE TABLE admin.admin_user (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT NOT NULL UNIQUE,
    role        TEXT NOT NULL, -- see Security Model RBAC roles
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Immutable, append-only audit trail for every admin write action across all contexts.
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

## 9. Design Notes

- **Append-only tables** (`gps_ping`, `reward_ledger_entry`, `audit_log_entry`, `ad_impression`, `ad_click`, and all `config.*` version tables): enforced at the application layer (repository methods expose only `insert`/`select`) and reinforced with `REVOKE UPDATE, DELETE` at the DB role level for the application's runtime user, with a separate, audited migration-only role for exceptional corrections.
- **Money** stored as `NUMERIC(10,2)` (EGP), never floating point.
- **Geospatial** columns use SRID 4326 (WGS84), consistent with GPS/OSM data; GiST indexes on every geometry column used in targeting/trust queries.
- **Partitioning** deferred to Scalability Plan but schema is partition-ready (natural partition keys: `created_at`/`recorded_at`, `city_id`).
- **Migrations** managed via a single migration tool (TypeORM/Prisma/Knex migrations, decided in Phase 2) with one migration history per schema, run in dependency order (`config`, `identity` → `trip` → `trust`, `reward` → `advertising` → `admin`).
