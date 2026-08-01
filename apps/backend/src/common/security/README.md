# Security Foundation

Phase 2 scope: infrastructure only, no authentication *business logic*.

- `jwt.service.ts` — sign/verify with `kid`-based key rotation support (Security Model §1, Pre-Implementation Audit §5). Generic: knows nothing about riders, admins, or how a token's claims get populated.
- `roles.decorator.ts` / `roles.guard.ts` — declarative RBAC (Security Model §3): `@Roles(AdminRole.SUPER_ADMIN)` + centrally-enforced `RolesGuard`. Depends on `request.adminUser` being populated by an authentication guard — that guard is Identity Context business logic, built when Identity is (Phase 3+).
- `rate-limiter.service.ts` — Redis-backed distributed fixed-window rate limiting (ADR-0013), fails closed on Redis unavailability. Policy (max requests, window) is a caller-supplied parameter — the actual `RateLimitConfig` values come from the Configuration module once specific endpoints (OTP, trip creation, GPS ingestion) exist to rate-limit.

**Explicitly out of scope for Phase 2** (per the task's own "do not implement" list and the Identity Context not yet existing): OTP delivery, Google/Apple OAuth exchange, any concrete authenticated endpoint. This module is what those will be built on top of.
