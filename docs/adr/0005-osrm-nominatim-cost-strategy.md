# ADR-0005: OSRM + Nominatim + OpenStreetMap Over Pay-Per-Request Mapping APIs

**Status:** Accepted

## Context

Commercial mapping/routing/geocoding APIs (e.g., Google Maps Platform) bill per request, which is directly hostile to a high-frequency, guest-first product where every fare estimate triggers a routing + geocoding call. The platform's stated Cost Strategy is to avoid pay-per-request architectures entirely.

## Decision

Use OpenStreetMap data as the map/tile source, OSRM for routing, and Nominatim for geocoding — all open-source and self-hostable. At MVP, hosted instances of OSRM/Nominatim may be used for delivery speed, but always behind the `RoutingProvider`/`GeocodingProvider` Ports (ADR-0003), so migration to self-hosted infrastructure is an adapter/infra change, not a rewrite.

## Consequences

- **Positive:** no per-request billing risk as usage scales; full data/infrastructure control long-term; aligns with self-hosting migration goal.
- **Negative:** self-hosted OSRM/Nominatim require infrastructure investment (data extracts, periodic re-indexing, server sizing) that a commercial API would abstract away; OSM data quality in Alexandria must be validated/improved where sparse.
- **Action item:** track OSM data completeness for Alexandria as a Phase 4 risk; contribute corrections upstream where gaps are found.
