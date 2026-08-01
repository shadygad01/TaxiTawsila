# Change Control Policy & Phase Definition of Done

**Status:** Effective immediately. This policy governs all work from Phase 2 onward.

## 1. Architecture Freeze

As of the Pre-Implementation Architecture Audit (`19-pre-implementation-audit.md`, 95.4/100, Phase 2 authorized), **the architecture is frozen.** Everything decided in `02-architecture.md`, `03-domain-model.md`, `04-erd.md`, `05-database-schema.md`, `06-api-specification.md`, `18-platform-extensions.md`, and ADR-0001 through ADR-0028 is the approved baseline. Implementation conforms to it; implementation does not reinterpret it.

Frozen means:
- Bounded context boundaries (the 10 contexts in `03-domain-model.md` §1) do not shift because a developer finds it convenient mid-implementation.
- Aggregate ownership, event contracts, schema shapes, versioning patterns (ADR-0017), and Provider Abstraction ports (ADR-0003) are load-bearing, not suggestions.
- **Business logic must never redefine architectural boundaries.** If implementing a use case seems to require putting Trust-owned logic in the Trip module, or a Reward query reaching directly into `trust` schema tables, or a new field bypassing the provenance/versioning discipline — that is a signal the architecture has a gap, not a license to route around it in code. Stop and follow §2.

## 2. Change Control Process

**No architectural shortcut is allowed.** Any change to a frozen decision — however small it seems from inside a single PR — requires all four of the following before a single line of implementing code is merged:

1. **A written ADR.** Numbered sequentially after ADR-0028, following the existing format (`docs/adr/NNNN-title.md`): Status, Context, Decision, Consequences. No verbal agreement, Slack message, or code comment substitutes for this.
2. **A documented justification.** Why the frozen decision doesn't hold for this case — not "it was easier this way," but a concrete reason (a wrong assumption is now known to be wrong, a requirement changed, a real constraint was discovered during implementation that Phase 1 couldn't have anticipated).
3. **Impact analysis.** Every document this change touches, listed explicitly (typically a subset of: Domain Model, ERD, Database Schema, API Specification, Security Model, Threat Model, Scalability Plan, other ADRs it amends or supersedes) — and those documents are updated in the same change, not left stale "for later."
4. **Migration strategy.** If data or a running system is affected: how existing rows/behavior transition to the new shape without a destructive break (consistent with the expand/contract pattern already established, Deployment Strategy §4). If nothing exists yet to migrate (early Phase 2), state that explicitly rather than omitting the section.

A change lacking any one of these four is not implementation — it is an undocumented architecture change wearing implementation's clothes, and it is rejected the same way an undocumented schema migration would be.

**What does *not* require this process** (ordinary implementation latitude, not an architectural change): internal method/class naming within an already-defined layer, choice of a specific library for an already-decided technology slot (e.g., which JSON schema validator, provided it fulfills Coding Standards), test structure, non-architectural refactors that don't cross a module/schema boundary or change a contract. When in doubt, treat it as architectural and write the ADR — the cost of an unnecessary short ADR is far lower than the cost of an undocumented boundary violation discovered three phases later.

## 3. Phase Definition of Done

Every phase in `15-roadmap.md` (Phase 2 onward) must satisfy **all** of the following before the next phase begins. This is in addition to, not a replacement for, each phase's own stated exit criteria.

| Condition | Operational meaning |
|---|---|
| **Architecture validation** | Every module/schema/event/endpoint built in this phase matches the frozen documents exactly, or is covered by an accepted ADR under §2. Verified by an explicit review pass before phase sign-off, not assumed from code review alone. |
| **Tests passing** | Full suite green per Testing Strategy's pyramid (unit/integration/E2E as applicable to the phase) — no skipped tests without a tracked follow-up issue (Testing Strategy §8), no "pending" or disabled test files. |
| **Documentation updated** | Any document whose described behavior this phase implements is checked against the actual implementation and corrected if implementation revealed a better or different approach — per §2 if the difference is architectural, as a plain doc fix if it's a clarification. |
| **Zero known critical bugs** | No open defect that causes data loss, incorrect reward/trust/fare outcomes, a security exposure, or a crash on a primary user path. "Known" includes anything surfaced in this phase's own testing, not only production incidents — a critical bug found and not yet fixed blocks phase completion, it doesn't get deferred to "fix in the next phase." |
| **Zero duplicated business logic** | A rule (a fare calculation, a trust signal, a threshold check) exists in exactly one place and every caller uses it — never copy-pasted into a second module because it was faster than exposing it properly. This is what Coding Standards' architecture-boundary checks and this policy's ADR requirement jointly exist to prevent. |
| **No TODOs** | No `TODO`/`FIXME`/`XXX` markers merged into the phase's code. If work is genuinely deferred, it is a tracked issue referenced by number in a comment explaining the current, complete state — never a bare marker implying "someone will finish this later" with no record of who or when. |
| **No temporary implementations** | No stub, hardcoded placeholder value, or "good enough for now" shortcut standing in for a real implementation of something the phase's exit criteria claims is done. A feature is either implemented per the frozen design or not claimed as complete — there is no middle state that ships. |
| **No commented-out production code** | Dead code is deleted, not commented out "in case we need it back" — version control is what "in case we need it back" means; a comment block of old code is noise and a source of confusion about which version is authoritative. |

**If any condition fails: stop, fix, then continue.** A phase is not "mostly done" — it is done, or it is not, and the next phase does not begin building on an undone one. This mirrors the master prompt's own engineering principle ("whenever you discover a better architectural solution, stop, refactor the architecture if necessary, then continue") extended explicitly to phase transitions, not just architectural discoveries.

## 4. Relationship to Existing Documents

- This policy formalizes and makes enforceable what `15-roadmap.md`'s "Roadmap Governance" section and `08-coding-standards.md`'s "Code Review Checklist" already implied — it does not introduce new engineering values, it gives them a hard gate.
- `08-coding-standards.md` §8's checklist remains the per-PR mechanism; this policy's Definition of Done is the per-phase mechanism. A PR can pass code review and the phase can still not be "done" until every PR in it collectively satisfies §3.
- Every ADR written under this policy is added to the index in `docs/README.md` exactly like ADR-0001 through ADR-0028.
