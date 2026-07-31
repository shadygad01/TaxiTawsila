# ADR-0004: PostgreSQL + PostGIS as the Sole Datastore at MVP

**Status:** Accepted

## Context

The platform needs strong transactional guarantees (fare/reward ledgers), rich geospatial querying (geofencing, route/radius targeting, trust distance/speed checks), and a schema that supports future ML feature extraction — all while staying open-source and self-hostable per the Cost Strategy.

## Decision

Use PostgreSQL as the single relational store, with the PostGIS extension for all geospatial data and queries (points, linestrings, polygons, GiST indexes). One logical database, one schema per bounded context (see Database Schema §1).

## Consequences

- **Positive:** mature, open-source, self-hostable, ACID guarantees for ledgers, excellent geospatial capability, one operational system to run at MVP.
- **Negative:** a single Postgres instance is a shared scaling bottleneck for very high write volume (e.g., GPS pings at large scale); mitigated via read replicas, partitioning, and eventual per-context database split if a module is extracted into its own service (see Scalability Plan).
- **Alternatives rejected:** a dedicated time-series DB for GPS pings (adds an operational system before it's justified); a NoSQL document store (weaker geospatial + transactional guarantees for ledgers).
