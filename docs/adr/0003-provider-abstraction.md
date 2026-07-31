# ADR-0003: Provider Abstraction (Ports & Adapters) for All External Dependencies

**Status:** Accepted

## Context

The platform depends on external capabilities — maps, routing, geocoding, push notifications, storage, authentication, analytics — that are commercially and technically volatile (pricing changes, rate limits, self-hosting migration goals per the Cost Strategy). Direct SDK coupling in business logic would make future migration a rewrite.

## Decision

Every external capability is accessed through a domain-owned **Port** (interface/abstract class defined in `shared-contracts` or the owning module's `domain` layer), with one or more **Adapters** implementing it. Adapters are bound at the composition root (Nest module providers / Flutter DI setup) — never instantiated inline in business/domain code.

Ports at MVP: `MapProvider`, `RoutingProvider`, `GeocodingProvider`, `NotificationProvider`, `StorageProvider`, `AuthenticationProvider`, `AnalyticsProvider`, `RewardProvider`, `AdProvider`.

## Consequences

- **Positive:** swapping a hosted OSRM instance for a self-hosted cluster, or adding a new reward/ad provider, is an adapter + DI-binding change — zero domain-logic changes. Enables the multi-city, multi-provider extensibility goal directly.
- **Negative:** upfront design cost — every new external need requires defining a Port before wiring an adapter, which is slower than calling an SDK directly.
- **Enforcement:** lint rule forbidding third-party SDK imports outside `infrastructure`/`platform` adapter directories.
