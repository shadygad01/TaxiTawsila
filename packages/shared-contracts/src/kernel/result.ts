/**
 * Result<T, E> error-handling convention (Domain Model §12, Shared Kernel).
 * Domain services return this instead of throwing for expected failure cases
 * (validation, business-rule violations) — exceptions remain reserved for truly
 * exceptional/unexpected conditions, per Coding Standards §2.
 */
export type Result<T, E> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: E }>;

export function ok<T, E = never>(value: T): Result<T, E> {
  return { ok: true, value };
}

export function err<E, T = never>(error: E): Result<T, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}
