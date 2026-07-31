# ADR-0026: Dual-Control (Maker-Checker) for High-Risk Configuration and Kill-Switch Changes

**Status:** Accepted (extends ADR-0017's versioning pattern and ADR-0018's Feature Management design)

## Context

The Pre-Implementation Audit found that any single `SUPER_ADMIN` can unilaterally publish a new `TrustThresholdConfig`/`FraudThresholdConfig`/`GpsThresholdConfig` version — including one that guts fraud detection (e.g., `min_verified_score = 0`) — with the only safeguard being that the action is logged after the fact (ADR-0017's audit trail). Separately, `FEATURE_MANAGER` can toggle *any* kill switch, including one wired to bypass a Trust/Fraud-relevant code path, with no distinction from toggling a purely cosmetic UI flag. Both are the same underlying gap: a single actor, malicious or merely careless, can disable fraud protection with no second check before it takes effect — logging catches it after the damage, not before.

## Decision

Designated **high-risk** configuration aggregates (`TrustThresholdConfig`, `FraudThresholdConfig`, `GpsThresholdConfig`, `DataQualityThresholdConfig`) and **high-risk** feature flags (any `FeatureFlag` with `isKillSwitch = true` AND tagged `riskTier = 'HIGH'` at creation time — an admin marks a kill switch high-risk when it gates a Trust/Fraud/Reward-relevant path) require a second approver before taking effect:

- The versioned-config status enum (ADR-0017) gains an intermediate state for high-risk aggregates only: `DRAFT → PENDING_APPROVAL → ACTIVE → SUPERSEDED`. A new column, `approved_by_admin_id`, must be set by an admin **other than** `created_by_admin_id` before a `PENDING_APPROVAL` row can transition to `ACTIVE`. Self-approval is rejected at the application layer, not just discouraged by convention.
- High-risk kill switches follow the same `PENDING_APPROVAL → ACTIVE` gate for the *toggle itself* going into effect — a proposal to flip a high-risk kill switch is recorded immediately but does not take effect until a second admin approves it, **except** during a declared incident window (a `SUPER_ADMIN`-only override, itself audit-logged with a mandatory reason), since the entire point of an emergency kill switch is sub-minute response time and a mandatory second-approver step would defeat that in a genuine emergency — the override exists specifically so "fast" and "dual-controlled" aren't permanently in tension, at the cost of requiring `SUPER_ADMIN` (the highest-trust role) to invoke it.
- Non-high-risk configuration (reward rules, advertising targeting, rate limits, ordinary feature flags) is unaffected — dual control is reserved for aggregates whose misconfiguration directly weakens fraud/trust protection, not applied blanket to every admin action, which would reintroduce the "over-engineered relative to actual risk" mistake the Architecture Review already flagged once for the Advertising Engine.

## Consequences

- **Positive:** a single compromised or careless admin account can no longer unilaterally disable fraud detection or flip a safety-critical kill switch outside a declared, accountable emergency path; the emergency override preserves kill switches' core value proposition (fast response) without abandoning accountability (still `SUPER_ADMIN`-only, still audit-logged with a mandatory reason).
- **Negative:** publishing a high-risk config change now requires two people to be available, which is a real operational cost for a small team — acceptable given what's being protected, and the emergency override exists precisely to avoid this becoming a liability during an actual incident.
- **RBAC note:** this makes `SUPER_ADMIN` load-bearing for both the emergency override and (per Security Model) all Fare Policy/Configuration publishing at MVP — a single-person `SUPER_ADMIN` bus-factor risk worth naming explicitly in Risk Analysis, since dual control for *everyone else* doesn't help if there's structurally only one `SUPER_ADMIN` account in practice at MVP team size.
