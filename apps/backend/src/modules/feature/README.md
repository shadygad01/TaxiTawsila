# Feature Management Context

Feature Management Context (Domain Model §10, ADR-0018). Toggles, percentage rollouts, kill switches, segments, experiments. Not part of Phase 2's explicit deliverable list (Configuration Platform was named, Feature Management was not) — this module is a wired, empty stub establishing the module boundary and its migration ownership (feature schema) ahead of Phase 3's full build-out.

**Layering (Folder Structure §2):** `domain/` (framework-free entities/value objects/domain services), `application/` (use cases), `infrastructure/` (TypeORM repositories, adapters), `interface/` (controllers, DTOs, the module definition) — all four directories exist and are empty except for the module stub, ready for the phase that implements this context's business logic.
