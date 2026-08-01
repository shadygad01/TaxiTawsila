import { money } from '../src/kernel/money';

describe('money()', () => {
  it('accepts a valid decimal amount', () => {
    expect(money('42.50')).toEqual({ amount: '42.50', currency: 'EGP' });
  });

  it('accepts a whole-number amount', () => {
    expect(money('10')).toEqual({ amount: '10', currency: 'EGP' });
  });

  it('rejects a floating-point-unsafe or malformed amount', () => {
    expect(() => money('10.999')).toThrow();
    expect(() => money('abc')).toThrow();
    expect(() => money('')).toThrow();
  });
});
