# ADR-0012: Descope Live Traffic from MVP Fare Estimation; Formalize Time-of-Day as the Interim Signal

**Status:** Accepted

## Context

The PRD (§7.1) lists "traffic" as a fare-estimation input, but no `TrafficProvider` port exists in the Provider Abstraction (ADR-0003), and no module computes or consumes live traffic data. The only traffic-adjacent mechanism that actually exists is the `time_of_day_multipliers` field on the versioned `FareRuleSet`. Building genuine live-traffic-responsive estimation would require either a new pay-per-request data source (conflicting with the Cost Strategy, ADR-0005) or significant self-hosted infrastructure (historical-speed-profile aggregation from OSM/OSRM) that isn't justified before MVP launch.

## Decision

MVP fare estimation uses **time-of-day/day-of-week static multipliers** (already modeled in `FareRuleSet`) as the answer to traffic-sensitive pricing, not live traffic data. This is named explicitly as a `TrafficProvider` port for future extensibility, with the MVP adapter being a static-multiplier implementation reading from `FareRuleSet`. A live-traffic-responsive adapter (e.g., derived from aggregated historical trip speeds once sufficient trip volume exists, or a future self-hosted traffic data source) is an explicitly deferred, post-MVP enhancement — not a Phase 5 deliverable.

## Consequences

- **Positive:** closes the PRD/architecture scope gap without introducing new infrastructure or cost risk; the port exists so a real live-traffic adapter can be added later (ADR-0003 pattern) without a redesign; historical trip data accumulated from launch (via the `trip_feature_snapshot`, ADR-0015-adjacent) is itself a candidate future data source for a self-derived traffic signal, avoiding third-party traffic APIs entirely.
- **Negative:** MVP fare ranges will be less responsive to real-time congestion than "traffic-aware" language might imply; PRD language updated to avoid overpromising.
