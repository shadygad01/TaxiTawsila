# Trust Context

Trust Context (Domain Model §5, ADR-0008). Independently evaluates every completed trip for fraud/reward-eligibility. Depends on Trip existing, which Phase 2 excludes; this module is a wired, empty stub establishing the module boundary and its migration ownership (trust schema) ahead of Phase 6.

**Layering (Folder Structure §2):** `domain/` (framework-free entities/value objects/domain services), `application/` (use cases), `infrastructure/` (TypeORM repositories, adapters), `interface/` (controllers, DTOs, the module definition) — all four directories exist and are empty except for the module stub, ready for the phase that implements this context's business logic.
