import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '../../../../src/common/security/jwt.service';

describe('JwtService', () => {
  const keys = [
    { kid: 'key-1', secret: 'secret-1' },
    { kid: 'key-2', secret: 'secret-2' },
  ];

  it('signs and verifies a round-trip token for the expected audience', () => {
    const service = new JwtService(keys, 'key-1');
    const token = service.sign({ sub: 'rider-123', aud: 'passenger' }, { expiresInSeconds: 60 });
    const claims = service.verify(token, 'passenger');
    expect(claims.sub).toBe('rider-123');
    expect(claims.aud).toBe('passenger');
  });

  it('rejects a token verified against the wrong audience', () => {
    const service = new JwtService(keys, 'key-1');
    const token = service.sign({ sub: 'admin-1', aud: 'admin' }, { expiresInSeconds: 60 });
    expect(() => service.verify(token, 'passenger')).toThrow(UnauthorizedException);
  });

  it('rejects an expired token', () => {
    const service = new JwtService(keys, 'key-1');
    const token = service.sign({ sub: 'rider-1', aud: 'passenger' }, { expiresInSeconds: -1 });
    expect(() => service.verify(token, 'passenger')).toThrow(UnauthorizedException);
  });

  it('selects the signing key by kid so rotation (old + new key both valid) works', () => {
    const activeOnKey2 = new JwtService(keys, 'key-2');
    const token = activeOnKey2.sign({ sub: 'rider-2', aud: 'passenger' }, { expiresInSeconds: 60 });

    // A verifier still configured with both keys (mid-rotation) can validate a
    // token signed under either kid — this is the whole point of kid-based
    // rotation (Security Model §1): old and new keys coexist during a
    // transition window.
    const verifier = new JwtService(keys, 'key-1');
    const claims = verifier.verify(token, 'passenger');
    expect(claims.sub).toBe('rider-2');
  });

  it('rejects a token whose kid is not among the configured keys', () => {
    const signer = new JwtService([{ kid: 'unknown-key', secret: 'x' }], 'unknown-key');
    const token = signer.sign({ sub: 'rider-3', aud: 'passenger' }, { expiresInSeconds: 60 });

    const verifier = new JwtService(keys, 'key-1');
    expect(() => verifier.verify(token, 'passenger')).toThrow(UnauthorizedException);
  });

  it('throws at construction time if activeKid is not among the provided keys', () => {
    expect(() => new JwtService(keys, 'missing-kid')).toThrow();
  });

  it('throws at construction time if no keys are provided', () => {
    expect(() => new JwtService([], 'any')).toThrow();
  });
});
