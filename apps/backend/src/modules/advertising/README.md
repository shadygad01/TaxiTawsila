# Advertising Context

Advertising Context (Domain Model §7). Merchant campaigns and geo-targeted delivery. Phase 2 excludes Advertisements by name; this module is a wired, empty stub establishing the module boundary and its migration ownership (advertising schema) ahead of Phase 8.

**Layering (Folder Structure §2):** `domain/` (framework-free entities/value objects/domain services), `application/` (use cases), `infrastructure/` (TypeORM repositories, adapters), `interface/` (controllers, DTOs, the module definition) — all four directories exist and are empty except for the module stub, ready for the phase that implements this context's business logic.
