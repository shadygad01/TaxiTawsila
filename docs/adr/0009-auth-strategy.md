# ADR-0009: Multi-Provider Auth (OTP, Google, Apple) With Guest-First Identity

**Status:** Accepted

## Context

Registration policy mandates guest mode be fully functional with no forced sign-up, while still supporting account-based reward redemption, multi-device sync, and recovery once needed (see PRD §8). Target users include Egyptian phone-based users (OTP is the primary trusted local pattern) and iOS/Android users expecting native social sign-in.

## Decision

- Every install gets a durable `deviceAnonId` (client-generated UUID, persisted in secure storage) immediately — this is the guest identity join-key, requiring no network call to acquire.
- The `identity.rider` table treats `GUEST` and `REGISTERED` as the same aggregate (ADR-linked to Domain Model §2) so registration **promotes** a rider in place rather than creating a new account and migrating data.
- Supported registered-auth methods at MVP: Phone OTP (SMS), Google Sign-In, Apple Sign-In — all behind the `AuthenticationProvider` port (ADR-0003), each provider an adapter, allowing more providers (e.g., Facebook, additional OIDC, WhatsApp OTP) to be added without touching the Identity domain logic.
- **Guest-history merge rule (added on Phase 1 architecture review, see `16-architecture-review.md` §12–14):** a device's `GUEST` rider is promoted (and its history preserved) **only when that device's own local rider is still `GUEST`** at the moment of registration. If the phone number/Google/Apple identity being verified already belongs to a different, existing `REGISTERED` rider, no merge occurs — the device simply signs in to that existing account, and the device's prior guest history is left un-migrated. This closes a fraud vector where a device farm reachable to one real verified identity could otherwise inject fabricated guest trip/reward history into an unrelated account via the merge path.

## Consequences

- **Positive:** zero-friction first use; no risky "merge two accounts" migration — registration is a state transition on the same identity row; extensible to more providers later; the merge rule above prevents guest history from ever crossing into an account it didn't originate on.
- **Negative:** guest identity tied to device storage is lost on uninstall/device change unless the user registers before that happens — this is an accepted, disclosed limitation of guest mode, and is the primary product incentive to register before switching devices. This same property also means **reinstalling the app resets guest-identity reward-eligibility history**, which is an accepted MVP fraud risk (mitigated by capping early reward value and monitoring abuse rate; hardware attestation via Play Integrity/App Attest is a named Phase 6+ hardening item if real abuse data justifies it — see Security Model §4, Threat Model §2).
- **Security note:** OTP delivery, rate limiting, and anti-abuse controls detailed in the Security Model and Threat Model.
- **Platform-policy note:** Apple's App Store Review Guidelines (§4.8) require offering Sign in with Apple on iOS whenever another third-party/social login (here, Google) is offered — Apple Sign-In in this ADR is therefore a hard iOS launch requirement, not optional polish, for as long as Google Sign-In ships on iOS.
