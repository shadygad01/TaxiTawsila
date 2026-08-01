/**
 * Branded ID types (Domain Model §12, Shared Kernel). Plain `string` at runtime;
 * the brand exists only so TypeScript rejects passing a RiderId where a CityId
 * is expected, etc. Defining the ID shape here is Shared Kernel scaffolding, not
 * an implementation of any owning module's business logic — the modules that own
 * these aggregates (Identity, Trip, Configuration) are built in later phases.
 */
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type CityId = Brand<string, 'CityId'>;
export type RiderId = Brand<string, 'RiderId'>;
export type TripId = Brand<string, 'TripId'>;

export function asCityId(value: string): CityId {
  return value as CityId;
}

export function asRiderId(value: string): RiderId {
  return value as RiderId;
}

export function asTripId(value: string): TripId {
  return value as TripId;
}
