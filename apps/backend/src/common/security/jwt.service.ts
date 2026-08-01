import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

export type JwtAudience = 'passenger' | 'admin';

export interface SigningKey {
  kid: string;
  secret: string;
}

export interface JwtClaims {
  sub: string;
  aud: JwtAudience;
  [claim: string]: unknown;
}

/**
 * JWT signing/verification with key-ID (`kid`) based rotation (Security Model
 * §1, added on Pre-Implementation Audit §5). Every token carries a `kid` header
 * from day one, even with a single configured key — rotation is then "publish
 * a new key under a new kid, accept both for a transition window, retire the
 * old one," not an improvised procedure invented under pressure years in.
 *
 * Deliberately generic: this service knows nothing about riders, admins, OTP,
 * or Google/Apple sign-in — those are Identity Context business logic (Phase
 * 3+). This is pure token-crypto infrastructure the Identity module will call.
 */
@Injectable()
export class JwtService {
  private readonly keysByKid: Map<string, string>;
  private readonly activeKid: string;

  constructor(keys: SigningKey[], activeKid: string) {
    if (keys.length === 0) {
      throw new Error('JwtService requires at least one signing key');
    }
    this.keysByKid = new Map(keys.map((k) => [k.kid, k.secret]));
    if (!this.keysByKid.has(activeKid)) {
      throw new Error(`activeKid "${activeKid}" is not among the provided signing keys`);
    }
    this.activeKid = activeKid;
  }

  sign(claims: JwtClaims, options: { expiresInSeconds: number }): string {
    const secret = this.keysByKid.get(this.activeKid);
    if (!secret) {
      throw new Error(`Active signing key "${this.activeKid}" is missing its secret`);
    }
    return jwt.sign(claims, secret, {
      keyid: this.activeKid,
      expiresIn: options.expiresInSeconds,
    });
  }

  verify(token: string, expectedAudience: JwtAudience): JwtClaims {
    const decodedHeader = jwt.decode(token, { complete: true });
    const kid = decodedHeader && typeof decodedHeader === 'object' ? decodedHeader.header.kid : undefined;
    if (!kid || !this.keysByKid.has(kid)) {
      throw new UnauthorizedException('Unknown or missing signing key id');
    }
    const secret = this.keysByKid.get(kid) as string;
    try {
      const claims = jwt.verify(token, secret) as JwtClaims;
      if (claims.aud !== expectedAudience) {
        throw new UnauthorizedException('Token audience mismatch');
      }
      return claims;
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
