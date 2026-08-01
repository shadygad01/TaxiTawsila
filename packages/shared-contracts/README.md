# @taxitawsila/shared-contracts

Shared kernel types (Domain Model §12): `Provenance`, `Result<T, E>`, `Money`, branded ID types, and the domain event envelope contract (ADR-0011/0023).

**Scope discipline:** this package holds cross-context primitives only — types with zero business logic, needed by more than one bounded context. It deliberately does **not** contain domain-specific DTOs (trip shapes, fare shapes, trust verdicts) — those belong to their owning module's own `interface` layer once that module is implemented (Folder Structure §5), and are added there, not here, when Trip/Trust/Fare/Reward phases begin. Adding a domain-specific type here without an owning module built yet would be exactly the "implement business features early" the current phase is scoped to avoid.

- `src/kernel/` — `Provenance`, `Result`, `Money`, branded IDs.
- `src/events/` — the domain event envelope shape.
- `src/enums/` — `AdminRole`, `VersionedConfigStatus`.
