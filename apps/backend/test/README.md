# Backend Tests

Mirrors `src/` (Folder Structure §6): `test/unit/`, `test/integration/`, `test/e2e/`.

- **Unit** (`jest.config.js`, `pnpm test`): no I/O, no real database/Redis — pure logic (`VersionedConfigService` against an in-memory fixture store, `OutboxRelayService` against mocked repositories, `JwtService`, `RolesGuard`). Fast, run on every save.
- **Integration** (`jest.integration.config.js`, `pnpm test:integration`): real Postgres+PostGIS and Redis (Testing Strategy §2 — "no mocked DB for repository tests"). Requires migrations to have been run first (`pnpm migration:run`) and `TEST_DB_*`/`REDIS_URL` env vars pointing at a live instance — either `infra/docker/docker-compose.yml`, a natively-installed instance, or CI's service containers (`.github/workflows/ci.yml`).
- **E2E**: empty in Phase 2 — there is no HTTP-reachable business flow yet to exercise end-to-end (Phase 2 explicitly excludes Trip/Fare/Rewards/Ads). Populated starting Phase 3+ once a real user-facing flow exists.

No test in this suite is skipped or pending without a tracked follow-up (Phase Definition of Done, `docs/20-change-control-and-definition-of-done.md`).
