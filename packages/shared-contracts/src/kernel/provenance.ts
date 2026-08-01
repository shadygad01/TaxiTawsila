/**
 * Provenance (ADR-0022): every computed value that feeds a downstream decision
 * (fare, trust, quality, reward) carries an explicit record of where it came from.
 *
 * `source` is intentionally a plain string, not a fixed union, because each owning
 * module defines its own closed set of valid sources (e.g. Trip's estimated-fare
 * provenance is 'FARE_FORMULA' | 'HISTORICAL_MODEL' | 'MANUAL_OVERRIDE') — this
 * type is the shared shape, not the shared vocabulary.
 */
export interface Provenance {
  readonly source: string;
  readonly producedByVersion: string;
  readonly computedAt: Date;
}

export const MANUAL_OVERRIDE_SOURCE = 'MANUAL_OVERRIDE' as const;
