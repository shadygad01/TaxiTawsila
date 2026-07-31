# ADR-0007: NestJS for the Backend

**Status:** Accepted

## Context

The chosen architecture (ADR-0002) requires a backend framework with first-class support for modular boundaries, dependency injection (needed for the Ports & Adapters pattern in ADR-0003), and a mature ecosystem for REST APIs, validation, and testing.

## Decision

Use NestJS (TypeScript/Node.js) as the backend framework. Its module system and DI container map directly onto the bounded-context module structure and the Provider Abstraction pattern, and TypeScript allows sharing DTO/event types with the React admin app via `packages/shared-contracts`.

## Consequences

- **Positive:** DI-first design fits the architecture exactly; strong TypeScript support enables shared contracts across backend and admin web; large ecosystem (validation, Swagger generation, testing utilities).
- **Negative:** Node.js single-threaded event loop requires care for CPU-bound work (e.g., heavy Trust Engine batch scoring) — mitigated via worker threads or offloading to a background job queue (Redis/BullMQ) rather than blocking request handlers.
- **Alternatives rejected:** a Go or Java backend (loses the shared-language benefit with the admin frontend for contracts, and DI is less idiomatic).
