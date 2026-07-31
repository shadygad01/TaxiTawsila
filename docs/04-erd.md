# Entity Relationship Diagram

**Status:** v1.1 — extended with Fare Policy, Data Quality, and Feature Management platforms (see `18-platform-extensions.md`). Corresponds directly to `05-database-schema.md`.

Given the schema now spans 10 bounded contexts, this is split into focused diagrams per cluster rather than one unreadable whole-database diagram. Cross-cluster references (e.g., `TRIP.fare_policy_version_id → FARE_POLICY_VERSION`) are called out in each diagram's notes.

## 1. Core Trip Lifecycle (Identity, Trip, Fare Policy)

```mermaid
erDiagram
    CITY ||--o{ TRIP : "scopes"
    CITY ||--o{ FARE_POLICY_VERSION : "scopes"

    RIDER ||--o{ TRIP : "takes"
    RIDER ||--o{ AUTH_IDENTITY : "links"

    TRIP ||--o{ GPS_PING : "records"
    FARE_POLICY_VERSION ||--o{ TRIP : "prices (effective version)"

    CITY {
        uuid id PK
        string name
        geometry bounds
        boolean active
    }

    RIDER {
        uuid id PK
        string kind "GUEST|REGISTERED"
        uuid device_anon_id
        timestamp created_at
        timestamp registered_at
    }

    AUTH_IDENTITY {
        uuid id PK
        uuid rider_id FK
        string provider "OTP_PHONE|GOOGLE|APPLE"
        string provider_subject
    }

    FARE_POLICY_VERSION {
        uuid id PK
        uuid city_id FK
        string version_label
        string government_reference
        numeric base_fare
        jsonb distance_rules
        jsonb waiting_rules
        jsonb time_of_day_rules
        jsonb special_adjustments
        string status
        timestamp effective_from
        uuid rolled_back_from FK
    }

    TRIP {
        uuid id PK
        uuid rider_id FK
        uuid city_id FK
        uuid fare_policy_version_id FK
        point origin
        point destination
        string status
        numeric estimated_fare_min
        numeric estimated_fare_max
        jsonb estimated_fare_provenance
        jsonb traffic_estimate_provenance
        numeric actual_fare
        geometry route
        int distance_meters
        timestamp started_at
        timestamp completed_at
    }

    GPS_PING {
        bigint id PK
        uuid trip_id FK
        uuid client_ping_id
        point location
        numeric accuracy_m
        timestamp recorded_at
        timestamp received_at
    }
```

**Notes:** `TRIP.fare_policy_version_id` is the reproducibility anchor for pricing (ADR-0021) — no "current config" lookup is ever needed to re-explain a historical fare. `estimated_fare_provenance`/`traffic_estimate_provenance` are inline JSONB snapshots (ADR-0022); the full history of any correction lives in `platform.provenance_log` (§6).

## 2. Trust & Data Quality (independent, parallel consumers of `TripCompleted`)

```mermaid
erDiagram
    TRIP ||--o| TRIP_TRUST_ASSESSMENT : "is scored by (fraud/reward)"
    TRIP ||--o| DATA_QUALITY_ASSESSMENT : "is scored by (dataset readiness)"
    TRIP ||--o| TRIP_FEATURE_SNAPSHOT : "has ML feature vector"

    TRIP_TRUST_ASSESSMENT ||--o{ TRUST_SIGNAL_RESULT : "composed of"
    DATA_QUALITY_ASSESSMENT ||--o{ DATA_QUALITY_COMPONENT_SCORE : "composed of"
    DATA_QUALITY_ASSESSMENT ||--o| DATA_REVIEW_CASE : "may require"
    DATA_REVIEW_CASE ||--o{ DATA_REVIEW_CASE_EVENT : "records transitions"
    DATA_REVIEW_CASE }o--o| TRIP : "merged_into_trip_id (if MERGED)"

    TRIP_TRUST_ASSESSMENT {
        uuid id PK
        uuid trip_id FK
        int trust_score
        string verdict "VERIFIED|REJECTED|FLAGGED_FOR_REVIEW"
        uuid trust_config_id FK
        string engine_version
        timestamp evaluated_at
    }

    TRUST_SIGNAL_RESULT {
        bigint id PK
        uuid assessment_id FK
        string signal_name
        numeric score
        numeric weight
    }

    DATA_QUALITY_ASSESSMENT {
        uuid id PK
        uuid trip_id FK
        numeric gps_score
        numeric route_score
        numeric fare_score
        numeric user_input_score
        numeric device_signal_score
        numeric overall_score
        string readiness_status "READY_FOR_AI|LOW_QUALITY|MISSING_DATA|SUSPICIOUS|UNDER_REVIEW"
        uuid quality_config_id FK
        string engine_version
    }

    DATA_QUALITY_COMPONENT_SCORE {
        bigint id PK
        uuid assessment_id FK
        string component_name "GPS|ROUTE|FARE|USER_INPUT|DEVICE_SIGNALS"
        numeric score
        numeric weight
    }

    TRIP_FEATURE_SNAPSHOT {
        uuid id PK
        uuid trip_id FK
        int distance_meters
        int duration_seconds
        numeric avg_speed_mps
        numeric route_deviation_ratio
        string time_of_day_bucket
        smallint day_of_week
    }

    DATA_REVIEW_CASE {
        uuid id PK
        uuid trip_id FK
        uuid assessment_id FK
        string state "PENDING_REVIEW|APPROVED|REJECTED|MERGED|CORRECTED|ESCALATED"
        uuid assigned_admin_id FK
        uuid merged_into_trip_id FK
        timestamp opened_at
        timestamp resolved_at
    }

    DATA_REVIEW_CASE_EVENT {
        bigint id PK
        uuid case_id FK
        string from_state
        string to_state
        uuid admin_id FK
        timestamp created_at
    }
```

**Notes:** `TRIP_TRUST_ASSESSMENT` and `DATA_QUALITY_ASSESSMENT` are both 1:1 with `TRIP` but owned by different contexts and independently reproducible (each with its own `engine_version` + config FK — ADR-0022). A trip can be Trust-`VERIFIED` and simultaneously Data-Quality-`UNDER_REVIEW`; this is expected, not a bug (ADR-0019). `dataquality.ml_ready_trip_dataset` (a view, not a table — see Database Schema §8) is the only sanctioned read path filtering to `readiness_status = READY_FOR_AI`.

## 3. Reward & Advertising

```mermaid
erDiagram
    RIDER ||--o| REWARD_WALLET : "has"
    REWARD_WALLET ||--o{ REWARD_LEDGER_ENTRY : "tracks"
    REWARD_LEDGER_ENTRY }o--o| REWARD_OFFER : "redeems"
    REWARD_LEDGER_ENTRY }o--o| TRIP : "source_trip_id (EARN)"
    REWARD_LEDGER_ENTRY }o--o| REWARD_RULE_CONFIG : "priced by (EARN)"
    REWARD_OFFER }o--|| MERCHANT : "offered by"

    MERCHANT ||--o{ CAMPAIGN : "runs"
    CAMPAIGN ||--o{ GEOFENCE : "targets"
    CAMPAIGN ||--o{ AD_IMPRESSION : "generates"
    AD_IMPRESSION ||--o| AD_CLICK : "may lead to"

    REWARD_LEDGER_ENTRY {
        bigint id PK
        uuid wallet_id FK
        string type "EARN|REDEEM"
        int points
        uuid source_trip_id FK
        uuid reward_offer_id FK
        uuid reward_rule_config_id FK
    }

    REWARD_WALLET {
        uuid id PK
        uuid rider_id FK
        int points_balance "derived from ledger, ADR-0016"
    }

    REWARD_OFFER {
        uuid id PK
        uuid merchant_id FK
        int points_cost
    }

    MERCHANT {
        uuid id PK
        uuid city_id FK
        string name
    }

    CAMPAIGN {
        uuid id PK
        uuid merchant_id FK
        uuid city_id FK
        string status
        int priority
        numeric budget_limit
        numeric budget_spent
    }

    GEOFENCE {
        uuid id PK
        uuid campaign_id FK
        string target_type
        geometry area
    }

    AD_IMPRESSION {
        bigint id PK
        uuid campaign_id FK
        uuid trip_id FK
        uuid rider_id FK
    }

    AD_CLICK {
        bigint id PK
        bigint impression_id FK
    }
```

## 4. Configuration & Feature Management

```mermaid
erDiagram
    CITY ||--o{ TRUST_THRESHOLD_CONFIG : "scopes"
    CITY ||--o{ REWARD_RULE_CONFIG : "scopes"
    CITY ||--o{ GPS_THRESHOLD_CONFIG : "scopes"
    CITY ||--o{ FRAUD_THRESHOLD_CONFIG : "scopes"
    CITY ||--o{ ADVERTISING_TARGET_CONFIG : "scopes"
    CITY ||--o{ DATA_QUALITY_THRESHOLD_CONFIG : "scopes"
    CITY }o--o{ FEATURE_FLAG : "scopes (nullable = all cities)"

    FEATURE_SEGMENT ||--o{ FEATURE_FLAG : "targets (nullable = all riders)"
    FEATURE_EXPERIMENT ||--o{ FEATURE_EXPOSURE_LOG : "records exposure"
    RIDER ||--o{ FEATURE_EXPOSURE_LOG : "exposed to"

    ADMIN_USER ||--o{ AUDIT_LOG_ENTRY : "performs"
    ADMIN_USER ||--o{ TRUST_THRESHOLD_CONFIG : "publishes"
    ADMIN_USER ||--o{ FARE_POLICY_VERSION_REF : "publishes"

    TRUST_THRESHOLD_CONFIG {
        uuid id PK
        uuid city_id FK
        int min_verified_score
        string status
        timestamp effective_from
        uuid rolled_back_from FK
    }

    REWARD_RULE_CONFIG {
        uuid id PK
        uuid city_id FK
        int points_per_verified_trip
        jsonb reward_multiplier_rules
        int daily_point_limit
        string status
        timestamp effective_from
    }

    GPS_THRESHOLD_CONFIG {
        uuid id PK
        uuid city_id FK
        numeric min_accuracy_meters
        numeric max_plausible_speed_mps
        int max_ping_gap_seconds
        timestamp effective_from
    }

    FRAUD_THRESHOLD_CONFIG {
        uuid id PK
        uuid city_id FK
        int max_verified_trips_per_day
        int duplicate_trip_window_minutes
        timestamp effective_from
    }

    ADVERTISING_TARGET_CONFIG {
        uuid id PK
        uuid city_id FK
        int default_radius_meters
        string priority_tie_break_rule
        timestamp effective_from
    }

    DATA_QUALITY_THRESHOLD_CONFIG {
        uuid id PK
        uuid city_id FK
        jsonb component_weights
        numeric ready_for_ai_min_score
        timestamp effective_from
    }

    FEATURE_FLAG {
        string key PK
        string kind "TOGGLE|PERCENTAGE_ROLLOUT|KILL_SWITCH|EXPERIMENT"
        boolean enabled
        smallint rollout_percentage
        string environment
        uuid city_id FK
        string segment_key FK
        boolean is_kill_switch
    }

    FEATURE_SEGMENT {
        string key PK
        jsonb rule
    }

    FEATURE_EXPERIMENT {
        string key PK
        jsonb variants
        string status
    }

    FEATURE_EXPOSURE_LOG {
        bigint id PK
        string experiment_key FK
        uuid rider_id FK
        string variant_key
    }

    ADMIN_USER {
        uuid id PK
        string email
        string role
    }

    AUDIT_LOG_ENTRY {
        bigint id PK
        uuid admin_user_id FK
        string action
        string entity_type
        string entity_id
    }
```

**Note on the diagram above:** `FARE_POLICY_VERSION_REF` is a shorthand node representing `farepolicy.fare_policy_version` (already fully modeled in Diagram 1) — repeated here only to show that it, too, is published by an `ADMIN_USER` and follows the same versioned/audited shape as every other `config.*` table (ADR-0017). Every table in this diagram (`RATE_LIMIT_CONFIG` not pictured for space) follows the identical `status`/`effective_from`/`rolled_back_from` shape.

## 5. Cross-Cutting Infrastructure (`platform` schema)

```mermaid
erDiagram
    OUTBOX {
        bigint id PK
        string event_type
        string aggregate_type
        uuid aggregate_id
        jsonb payload
        timestamp dispatched_at
    }

    PROVENANCE_LOG {
        bigint id PK
        string entity_type
        uuid entity_id
        jsonb value
        string source
        string source_version
        timestamp recorded_at
    }
```

**Note:** these two tables have no FK relationships to domain tables by design (`aggregate_id`/`entity_id` are loosely-typed references resolved by `aggregate_type`/`entity_type` string discriminators, not hard FKs) — this is deliberate: the outbox and provenance log must be writable from any schema's transaction without creating a circular or overly rigid cross-schema FK web, and both are append-only audit/delivery mechanisms, not queried relationally in normal operation.
