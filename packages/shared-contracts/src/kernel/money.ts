/**
 * Money (Domain Model §12, Shared Kernel). Stored/transported as a decimal string,
 * never a floating-point number, matching Database Schema §12's NUMERIC(10,2)
 * convention — floating point is never an acceptable representation for currency
 * anywhere in this codebase, backend or client.
 */
export interface Money {
  readonly amount: string;
  readonly currency: 'EGP';
}

export function money(amount: string): Money {
  if (!/^-?\d+(\.\d{1,2})?$/.test(amount)) {
    throw new Error(`Invalid money amount: "${amount}" — expected a decimal string with up to 2 places`);
  }
  return { amount, currency: 'EGP' };
}
