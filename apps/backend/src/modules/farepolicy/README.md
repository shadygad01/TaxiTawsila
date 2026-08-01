# Fare Policy Context

Fare Policy Context (ADR-0021). Owns fare business rules — government fare policy, base fare, distance/waiting/time-of-day rules, special adjustments — independent of Trip's estimation orchestration. Phase 2 excludes Fare estimation by name; this module is a wired, empty stub establishing the module boundary and its migration ownership (farepolicy schema) ahead of Phase 5.

**Layering (Folder Structure §2):** `domain/` (framework-free entities/value objects/domain services), `application/` (use cases), `infrastructure/` (TypeORM repositories, adapters), `interface/` (controllers, DTOs, the module definition) — all four directories exist and are empty except for the module stub, ready for the phase that implements this context's business logic.
