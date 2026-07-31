# ADR-0015: GPS Ping Storage — Composite Time-Ordered Index, Monthly Partitioning, No Per-Row Spatial Index

**Status:** Accepted (revises the original `trip.gps_ping` design in `05-database-schema.md`)

## Context

`trip.gps_ping` is the highest-volume table in the system at every scale band (tens of thousands to tens of millions of rows/day depending on MAU). The original schema put a GiST spatial index on `location` for every row. No query in the Domain Model or Trust Engine design performs spatial containment search over individual pings — all real access patterns are per-trip, time-ordered (`WHERE trip_id = ? ORDER BY recorded_at`). The spatial index therefore costs write overhead and disk space on every insert for a query pattern that never benefits from it, while the table had no stated partitioning plan despite being the clearest partitioning candidate in the schema.

## Decision

- Replace the per-row GiST spatial index on `gps_ping.location` with a composite B-tree index on `(trip_id, recorded_at)` as the primary access path (this was already present as a secondary index; it becomes the primary design consideration, and the spatial index is dropped).
- Partition `trip.gps_ping` by range on `recorded_at`, monthly, from the first migration — not retrofitted after the table is populated.
- Add a server-stamped `received_at TIMESTAMPTZ NOT NULL DEFAULT now()` column alongside the client-supplied `recorded_at`, so large divergence between client-claimed and server-observed timing is available as a Trust Engine input (client clocks are not a trusted source for fraud-relevant timing).
- Add a client-generated `client_ping_id UUID` and a unique constraint on `(trip_id, client_ping_id)` to make batched-flush ingestion idempotent (`INSERT ... ON CONFLICT DO NOTHING`), since offline-buffered batches may be retried.

## Consequences

- **Positive:** removes write-path overhead that provided no query benefit; partitioning designed in from the start avoids a disruptive retrofit once the table is populated at the 100,000+ MAU band; idempotent ingestion prevents duplicate pings from retried offline-flush batches; server-side timing gives the Trust Engine a client-timestamp-manipulation signal it previously lacked.
- **Negative:** if a genuine spatial query over raw pings emerges later (not currently anticipated by any subsystem), it would need a new index added at that time — an acceptable trade given no current design calls for it.
- **Related:** Scalability Plan §3 partitioning guidance is now a concrete decision rather than a "consider later" note.
