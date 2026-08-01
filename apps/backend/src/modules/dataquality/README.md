# Data Quality Context

Data Quality Context (Domain Model §8, ADR-0019/0020). Independently assesses whether a completed trip's data can be trusted for ML use, structurally separate from Trust. Depends on Trip/Trust existing, which Phase 2 excludes; this module is a wired, empty stub establishing the module boundary and its migration ownership (dataquality schema) ahead of Phase 6.

**Layering (Folder Structure §2):** `domain/` (framework-free entities/value objects/domain services), `application/` (use cases), `infrastructure/` (TypeORM repositories, adapters), `interface/` (controllers, DTOs, the module definition) — all four directories exist and are empty except for the module stub, ready for the phase that implements this context's business logic.
