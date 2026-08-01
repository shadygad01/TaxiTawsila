import { ok, err, isOk, isErr } from '../src/kernel/result';

describe('Result<T, E>', () => {
  it('wraps a success value', () => {
    const result = ok<number, string>(42);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
    if (isOk(result)) {
      expect(result.value).toBe(42);
    }
  });

  it('wraps a failure value', () => {
    const result = err<string, number>('boom');
    expect(isErr(result)).toBe(true);
    expect(isOk(result)).toBe(false);
    if (isErr(result)) {
      expect(result.error).toBe('boom');
    }
  });
});
