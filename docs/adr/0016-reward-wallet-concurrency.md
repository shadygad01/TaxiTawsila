# ADR-0016: Reward Wallet Balance Derived Transactionally From the Ledger, No Separately-Updated Balance Column

**Status:** Accepted (revises `reward.reward_wallet.points_balance` handling in `05-database-schema.md`)

## Context

The original design stored `points_balance` as a separately-maintained projection alongside the append-only `reward_ledger_entry` table, with no stated concurrency control. Two concurrent redemption requests against the same wallet (double-tap, client retry after a timeout, or two devices on one now-registered account) could both read the same balance and both succeed, overdrawing the wallet. This is a correctness bug independent of traffic scale — client-side retries make it plausible even at low user counts.

## Decision

A redemption (or any ledger-affecting operation) is executed as: within a single database transaction, compute the current balance as `SUM(points) FROM reward_ledger_entry WHERE wallet_id = ?` (or an equivalent `SELECT ... FOR UPDATE` guarded read), verify the resulting balance after the new entry would be non-negative, then insert the new ledger entry — all inside one transaction with an isolation level (`REPEATABLE READ` or `SERIALIZABLE`, finalized in Phase 7 implementation) sufficient to prevent the double-redemption race. `reward_wallet.points_balance`, if retained at all, is a denormalized read-optimization cache recomputed from the ledger, never an independent source of truth, and is never written by a code path other than the same transaction that appends the ledger entry.

## Consequences

- **Positive:** removes an entire class of balance-drift/double-spend bugs by construction; the ledger remains the single source of truth, consistent with its append-only audit design intent.
- **Negative:** a `SUM` over a rider's ledger runs on every balance-affecting transaction — acceptable given a per-rider ledger is small (bounded by that rider's trip/redemption count, not global volume); if this ever becomes measurable overhead at very high per-rider ledger sizes, a periodically-refreshed materialized balance with the same transactional guard can be introduced without changing the ledger-as-truth model.
