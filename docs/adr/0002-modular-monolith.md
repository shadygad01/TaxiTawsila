# ADR-0002: Modular Monolith Backend (Not Microservices) at MVP

**Status:** Accepted

## Context

The platform has clearly separable bounded contexts (Trip, Trust, Reward, Advertising, Identity, Admin). Microservices would let each scale/deploy independently, but at MVP scale (single city, pre-launch) the operational overhead of distributed systems (service discovery, network reliability, distributed tracing, multiple deployment pipelines) outweighs the benefit, and a small team cannot productively operate many services.

## Decision

Build the backend as a single deployable NestJS application, internally organized into strictly isolated modules — one per bounded context — each with its own domain/application/infrastructure/interface layering and its own Postgres schema. Modules communicate only via explicit application-service calls or an internal event bus, never shared tables or reaching into another module's internals.

## Consequences

- **Positive:** one deployment unit, simpler ops, lower cost, faster iteration; module boundaries are enforced by lint rules and schema separation from day one, not retrofitted.
- **Negative:** shared process means a bug/leak in one module can affect the whole app's availability; requires discipline to not violate boundaries "just this once."
- **Future path:** because boundaries are real (own schema, own layered code, communication only through defined interfaces/events), any module — most likely Trust Engine or Advertising — can be extracted into its own service later by moving its schema to its own database and swapping in-process calls for network calls, without rewriting domain logic. See ADR-0008.
