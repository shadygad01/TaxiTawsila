# ADR-0009: Multi-Provider Auth (OTP, Google, Apple) With Guest-First Identity

**Status:** Accepted

## Context

Registration policy mandates guest mode be fully functional with no forced sign-up, while still supporting account-based reward redemption, multi-device sync, and recovery once needed (see PRD §8). Target users include Egyptian phone-based users (OTP is the primary trusted local pattern) and iOS/Android users expecting native social sign-in.

## Decision

- Every install gets a durable `deviceAnonId` (client-generated UUID, persisted in secure storage) immediately — this is the guest identity join-key, requiring no network call to acquire.
- The `identity.rider` table treats `GUEST` and `REGISTERED` as the same aggregate (ADR-linked to Domain Model §2) so registration **promotes** a rider in place rather than creating a new account and migrating data.
- Supported registered-auth methods at MVP: Phone OTP (SMS), Google Sign-In, Apple Sign-In — all behind the `AuthenticationProvider` port (ADR-0003), each provider an adapter, allowing more providers (e.g., Facebook, additional OIDC) to be added without touching the Identity domain logic.

## Consequences

- **Positive:** zero-friction first use; no risky "merge two accounts" migration — registration is a state transition on the same identity row; extensible to more providers later.
- **Negative:** guest identity tied to device storage is lost on uninstall/device change unless the user registers before that happens — this is an accepted, disclosed limitation of guest mode, and is the primary product incentive to register before switching devices.
- **Security note:** OTP delivery, rate limiting, and anti-abuse controls detailed in the Security Model and Threat Model.
