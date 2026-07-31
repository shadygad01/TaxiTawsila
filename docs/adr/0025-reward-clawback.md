# ADR-0025: Reward Clawback for Post-Hoc Fraud or Duplicate-Trip Discovery

**Status:** Accepted (extends the Reward Context, Domain Model §6)

## Context

Trust's automated duplicate-trip and fraud checks (Threat Model §3) are not infallible — that is exactly why the Data Quality Manual Review Queue (ADR-0020) exists as a human backstop. The Pre-Implementation Audit identified a real, previously unaddressed scenario: a trip is Trust-verified and a reward is granted (`reward_ledger_entry.type = 'EARN'`), and *afterward*, a `DataReviewCase` resolves to `MERGED` (identified as a duplicate) or a fraud pattern is confirmed on review — meaning a reward now rests on a trip that shouldn't have earned one. Nothing in the design reverses, flags, or even records this. Silently leaving it unaddressed means the platform's own review process, once it does its job, has no way to act on what it finds.

## Decision

`reward.reward_ledger_entry.type` gains a third value: `CLAWBACK`. When a `DataReviewCase` resolves to `MERGED` or `REJECTED` for a trip that has a prior `EARN` entry, the Reward Context (subscribing to `DataReviewCaseResolved`, ADR-0020, via the outbox) writes a `CLAWBACK` ledger entry for the same points amount, referencing the original `source_trip_id` and the review case. The wallet balance (still derived transactionally from `SUM(ledger entries)`, ADR-0016) may go **negative** as a result of a clawback exceeding the rider's current balance (e.g., the rider already redeemed the points) — this is allowed at the ledger level, but `RedemptionService` blocks any new `REDEEM` while the balance is negative, requiring it to be earned back to zero first. A negative balance is never itself an error state to alert on as "fraud" — it is the expected, correct outcome of a clawback exceeding available balance, and is surfaced to the rider transparently (a ledger entry, not a silent debit) rather than hidden.

## Consequences

- **Positive:** the Manual Review Queue's findings now have a real, defined effect on the Reward ledger instead of being data-quality-only; the platform can no longer end up in a state where a known-fraudulent or known-duplicate trip's reward is left standing simply because no mechanism existed to reverse it; the ledger's append-only, auditable design (ADR-0016) extends cleanly to this new entry type without any structural change.
- **Negative:** redemption logic must now check for a non-negative balance as a precondition (already true for the redemption amount specifically; now additionally true as a standing gate while any negative balance exists), and rider-facing UX must explain a clawback in plain language ("a trip's reward was reversed after review") rather than presenting it as an unexplained balance drop — a product/support responsibility, not just an engineering one.
- **Scope note:** this ADR defines the mechanism and ledger semantics; it does not define whether/how a merchant-side redeemed-coupon clawback is possible (e.g., if points were already spent on an offer before the clawback) — that is out of scope for MVP and tracked as a follow-on question for the Reward Provider adapters (ADR-0003) if/when it becomes a real scenario.
