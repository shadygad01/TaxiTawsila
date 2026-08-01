# Migrations

TypeORM migrations (Database Schema §12: migration tool decided in Phase 2), one file per schema, run in the exact dependency order documented there: `admin` → `config` → `identity` → `farepolicy` → `trip` → `trust` → `dataquality` → `reward` → `advertising` → `feature` → `platform`.

Each bounded-context schema is created by its own migration, owned by that module, even when (as in Phase 2) the module has no tables of its own yet — this keeps migration ownership 1:1 with module ownership from day one rather than retrofitting it when the module's real tables are added.

**Run:** `pnpm --filter @taxitawsila/backend migration:run` (requires `DATABASE_*` env vars pointing at a real Postgres+PostGIS instance — see root `.env.example` / `infra/docker/docker-compose.yml`).

**Phase 2 scope:** `admin.admin_user`, `admin.audit_log_entry`, `config.city` (+ an Alexandria seed row), and the full `platform.*` outbox family (`outbox`, `outbox_dead_letter`, `event_consumption_log`, `provenance_log`). Every other schema exists (so FKs and future migrations have somewhere to attach) but is empty of tables — those arrive with the phase that implements each context's business logic.
