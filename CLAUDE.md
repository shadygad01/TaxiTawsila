# Taxi Alexandria Platform (Taxi Tawsila) — Repository Guide

## What this is

A passenger-only fare-estimation, live-tracking, and transportation-intelligence platform for traditional Alexandria taxis. **Never** implement taxi booking, driver accounts, driver communication, driver ratings, or ride dispatching — see `docs/01-prd.md` §3.

## Current status

**Phase 1 (Research & Architecture) is complete and the architecture is frozen. Phase 2 (Project Foundation) is complete** — verified against the Definition of Done in `docs/21-phase2-foundation-audit.md`. **Phase 3 does not begin automatically**; it starts only on a separate, explicit instruction. Start at `docs/README.md` for the full document index — read it before touching anything else in this repo.

## Architecture is frozen — this is not optional guidance

Everything decided in `docs/02-architecture.md`, `docs/03-domain-model.md`, `docs/04-erd.md`, `docs/05-database-schema.md`, `docs/06-api-specification.md`, `docs/18-platform-extensions.md`, and ADR-0001–0028 (`docs/adr/`) is the approved baseline. **Implementation conforms to it; implementation does not reinterpret it.**

If implementing something seems to require crossing a bounded-context boundary, reaching into another module's schema, bypassing the versioning/provenance discipline, or otherwise deviating from what's documented — **that is a signal the architecture has a gap, not permission to route around it in code.** Business logic must never redefine architectural boundaries.

**Any architectural change requires, before implementation proceeds:**
1. A written ADR (`docs/adr/NNNN-title.md`, numbered after the highest existing ADR)
2. A documented justification (not "it was easier")
3. Impact analysis (every doc the change touches, updated in the same change)
4. A migration strategy (or an explicit statement that nothing exists yet to migrate)

Full policy, including what counts as "architectural" vs. ordinary implementation latitude: `docs/20-change-control-and-definition-of-done.md`.

## Phase Definition of Done

Every phase (Phase 2 onward, per `docs/15-roadmap.md`) must satisfy, in addition to its own stated exit criteria:

- Architecture validation (matches frozen docs, or covered by an accepted ADR)
- Tests passing (full suite per `docs/13-testing-strategy.md`, nothing skipped without a tracked issue)
- Documentation updated
- Zero known critical bugs
- Zero duplicated business logic
- No TODOs
- No temporary implementations
- No commented-out production code

**If any condition fails: stop, fix, then continue.** Don't start the next phase on top of an unfinished one. Full detail: `docs/20-change-control-and-definition-of-done.md` §3.

## Where things live

- `docs/README.md` — full index, read this first.
- `docs/01-prd.md` through `docs/17-architecture-improvements.md` — Phase 1 core docs plus the first architecture review.
- `docs/18-platform-extensions.md` — Data Quality, Feature Management, Configuration Platform, Fare Policy Engine design.
- `docs/19-pre-implementation-audit.md` — the final gate before Phase 2; explains every fix behind ADR-0023–0028.
- `docs/20-change-control-and-definition-of-done.md` — the policy this file summarizes.
- `docs/adr/` — all Architecture Decision Records, sequential, never renumbered or edited after acceptance (amend via a new ADR that supersedes, or an explicit "amended" note, matching existing precedent like ADR-0009 and ADR-0010).
- `docs/07-folder-structure.md` — the monorepo layout implementation must follow once code exists (`apps/backend`, `apps/mobile`, `apps/admin-web`, `packages/*`, `infra/*`).
- `docs/08-coding-standards.md` — per-PR code review checklist; the per-phase Definition of Done above is a superset, not a replacement.

## When in doubt

Re-read the relevant frozen document before guessing. If it's genuinely ambiguous or missing, that's an architecture gap — write the ADR per the change-control process above rather than silently deciding in code.
