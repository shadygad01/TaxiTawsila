# Entity Relationship Diagram

**Status:** Draft v1.0 — Phase 1

Corresponds directly to the Database Schema (`05-database-schema.md`). Grouped by bounded context/schema.

```mermaid
erDiagram
    CITY ||--o{ FARE_RULE_SET : "scopes"
    CITY ||--o{ TRUST_THRESHOLD_CONFIG : "scopes"
    CITY ||--o{ TRIP : "scopes"
    CITY ||--o{ CAMPAIGN : "scopes"

    RIDER ||--o{ TRIP : "takes"
    RIDER ||--o| REWARD_WALLET : "has"
    RIDER ||--o{ AUTH_IDENTITY : "links"

    TRIP ||--o{ GPS_PING : "records"
    TRIP ||--o| TRIP_TRUST_ASSESSMENT : "is scored by"
    TRIP ||--o{ AD_IMPRESSION : "may show"
    TRIP ||--o| REWARD_LEDGER_ENTRY : "may earn"

    TRIP_TRUST_ASSESSMENT ||--o{ TRUST_SIGNAL_RESULT : "composed of"

    REWARD_WALLET ||--o{ REWARD_LEDGER_ENTRY : "tracks"
    REWARD_LEDGER_ENTRY }o--o| REWARD_OFFER : "redeems"
    REWARD_OFFER }o--|| MERCHANT : "offered by"

    MERCHANT ||--o{ CAMPAIGN : "runs"
    CAMPAIGN ||--o{ GEOFENCE : "targets"
    CAMPAIGN ||--o{ AD_IMPRESSION : "generates"
    AD_IMPRESSION ||--o| AD_CLICK : "may lead to"

    FARE_RULE_SET ||--o{ TRIP : "priced by (effective version)"
    TRUST_THRESHOLD_CONFIG ||--o{ TRIP_TRUST_ASSESSMENT : "governs (effective version)"

    ADMIN_USER ||--o{ AUDIT_LOG_ENTRY : "performs"

    CITY {
        uuid id PK
        string name
        string country
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
        string provider "OTP|GOOGLE|APPLE"
        string provider_subject
        timestamp linked_at
    }

    TRIP {
        uuid id PK
        uuid rider_id FK
        uuid city_id FK
        point origin
        point destination
        string status
        numeric estimated_fare_min
        numeric estimated_fare_max
        numeric actual_fare
        geometry route
        int distance_meters
        int estimated_duration_seconds
        uuid fare_rule_set_id FK
        timestamp started_at
        timestamp completed_at
    }

    GPS_PING {
        uuid id PK
        uuid trip_id FK
        point location
        numeric accuracy
        numeric speed
        timestamp recorded_at
    }

    TRIP_TRUST_ASSESSMENT {
        uuid id PK
        uuid trip_id FK
        int trust_score
        string verdict
        uuid trust_config_id FK
        string rule_set_version
        timestamp evaluated_at
    }

    TRUST_SIGNAL_RESULT {
        uuid id PK
        uuid assessment_id FK
        string signal_name
        numeric score
        numeric weight
        jsonb detail
    }

    REWARD_WALLET {
        uuid id PK
        uuid rider_id FK
        int points_balance
    }

    REWARD_LEDGER_ENTRY {
        uuid id PK
        uuid wallet_id FK
        string type "EARN|REDEEM"
        int points
        uuid source_trip_id FK
        uuid reward_offer_id FK
        timestamp created_at
    }

    REWARD_OFFER {
        uuid id PK
        uuid merchant_id FK
        string title
        int points_cost
        timestamp valid_from
        timestamp valid_to
    }

    MERCHANT {
        uuid id PK
        uuid city_id FK
        string name
        string category
        timestamp created_at
    }

    CAMPAIGN {
        uuid id PK
        uuid merchant_id FK
        uuid city_id FK
        string status
        int priority
        numeric budget_limit
        numeric budget_spent
        timestamp start_at
        timestamp end_at
    }

    GEOFENCE {
        uuid id PK
        uuid campaign_id FK
        geometry area
        string target_type "GEOFENCE|ROUTE|RADIUS"
    }

    AD_IMPRESSION {
        uuid id PK
        uuid campaign_id FK
        uuid trip_id FK
        uuid rider_id FK
        timestamp served_at
    }

    AD_CLICK {
        uuid id PK
        uuid impression_id FK
        timestamp clicked_at
    }

    FARE_RULE_SET {
        uuid id PK
        uuid city_id FK
        numeric base_fare
        numeric per_km_rate
        jsonb time_of_day_multipliers
        timestamp effective_from
    }

    TRUST_THRESHOLD_CONFIG {
        uuid id PK
        uuid city_id FK
        int min_verified_score
        jsonb signal_weights
        timestamp effective_from
    }

    ADMIN_USER {
        uuid id PK
        string email
        string role
        timestamp created_at
    }

    AUDIT_LOG_ENTRY {
        uuid id PK
        uuid admin_user_id FK
        string action
        jsonb before
        jsonb after
        timestamp created_at
    }
```

## Notes

- `FARE_RULE_SET` and `TRUST_THRESHOLD_CONFIG` are **versioned, append-only** configuration tables (`effective_from`); a `TRIP`/`TRIP_TRUST_ASSESSMENT` stores an FK to the exact version in force at evaluation time, not a "current" pointer — required for auditability and reproducibility.
- `RIDER` unifies guest and registered identity under one primary key so trip/reward history never has to be re-keyed on registration (see Domain Model §2).
- `GPS_PING` is intentionally a child table, not embedded JSON, so the Trust Engine can run set-based SQL/PostGIS queries (speed outliers, gaps) directly.
