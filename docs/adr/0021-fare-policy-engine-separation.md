# ADR-0021: Fare Policy Engine Separated From Fare Estimation

**Status:** Accepted (revises the Trip Context's Fare Engine design from `03-domain-model.md` §3/Architecture Review §1)

## Context

Phase 1 modeled fare estimation as a single `FareEstimationService` inside the Trip Context, reading directly from `config.fare_rule_set`. The mandatory Fare Policy Engine requirement calls for a distinct responsibility: government fare policy, base fare, distance rules, waiting rules, time-of-day rules, special adjustments, and versioning — independent of the orchestration logic that gathers a specific trip's distance/duration/traffic signal and asks for a price. Fusing these means every future business-rule change (a new surcharge type, a new distance-tier structure) touches Trip-context code, and the fare policy has no independent versioned aggregate rich enough to express government fare references or tiered rules.

## Decision

Fare Policy becomes its own bounded context (schema `farepolicy`), owning the `FarePolicyVersion` aggregate (base fare, tiered distance rules, waiting rules, time-of-day rules, special adjustments, government reference, versioned per ADR-0017's shape) and a pure `FarePolicyEngine.computeFareRange(policy, distanceMeters, durationSeconds, trafficSignal) → FareRange` domain service. The Trip Context's `FareEstimationService` becomes a thin orchestrator: fetch distance/duration from `RoutingProvider`, a traffic signal from `TrafficProvider` (ADR-0012), resolve the active `FarePolicyVersion` for the city/date, call `computeFareRange`, then persist the result on `Trip` along with `fare_policy_version_id` and `estimated_fare_provenance` (ADR-0022). This is a synchronous in-process call (Fare Policy is a supporting/generic-subdomain context like Configuration, not event-driven like Trust) since fare estimation is on the interactive request path.

## Consequences

- **Positive:** fare policy changes (a new government tariff, a new surcharge) are entirely contained within the `farepolicy` schema/module and its own admin surface, with zero Trip-context code changes; `FarePolicyEngine.computeFareRange` is a pure function, exhaustively table-driven-testable in isolation from routing/traffic orchestration concerns; every historical trip's estimate is reproducible by replaying `computeFareRange` against its stored `fare_policy_version_id` — a concrete, testable regression-suite category (replay N historical trips, assert identical output).
- **Negative:** one more bounded context/schema; `config.fare_rule_set` (Phase 1's original table) is retired in favor of `farepolicy.fare_policy_version` — a schema correction made before any code exists against the old shape, which is the cheapest possible time to make it.
