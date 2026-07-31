# ADR-0006: Flutter for the Passenger Mobile App

**Status:** Accepted

## Context

The passenger app must ship on both iOS and Android with a small team, needs strong real-time map rendering, and must integrate GPS tracking reliably in the background during trips.

## Decision

Build the passenger mobile app in Flutter, using Clean Architecture layering (domain/data/presentation) and `flutter_map` (MapLibre-compatible) for map rendering, kept behind the `MapProvider` port (ADR-0003).

## Consequences

- **Positive:** single codebase for both platforms, mature plugin ecosystem for maps/geolocation, strong community support for the open-source map stack chosen in ADR-0005.
- **Negative:** background GPS reliability nuances differ by platform (iOS background modes, Android battery optimization) and must be handled explicitly in the GPS Engine (Phase 5).
- **Alternatives rejected:** separate native iOS/Android codebases (too costly for team size); React Native (weaker native map/geolocation ecosystem fit for this use case).
