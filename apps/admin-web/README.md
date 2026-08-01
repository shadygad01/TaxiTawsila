# Taxi Alexandria — Admin Dashboard

React admin dashboard (Folder Structure §4). Phase 2 scope (docs/21-phase2-foundation-audit.md): app shell + a working System Health page calling the backend's real `/admin/system/health` endpoint — proving the build/lint/typecheck/test pipeline and the API-client pattern end to end, without any business feature.

`src/features/*` are scaffolded per the frozen folder structure but empty of components — each has a README explaining what it's waiting on. Populated starting Phase 9 (Administration Platform) as each corresponding backend context ships.

## Run locally

```
pnpm --filter @taxitawsila/admin-web dev
```

Requires the backend running (`pnpm --filter @taxitawsila/backend start:dev`) for the health page to show real data — the page still renders (with a fetch error) if it's not.
