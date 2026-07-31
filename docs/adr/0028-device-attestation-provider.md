# ADR-0028: Device Attestation as a Formal Provider Abstraction

**Status:** Accepted

## Context

Play Integrity API / App Attest were referenced informally (ADR-0009, Security Model) as a future anti-farming control for reinstall-based guest reward abuse and general device-farm detection, but no Port was ever defined for it in the Provider Abstraction table (Architecture §4). Wiring a specific attestation SDK directly into Trust or Data Quality evaluator code later would violate the architecture's own foundational principle that no business logic may directly depend on a third-party SDK (ADR-0003).

## Decision

Add `DeviceAttestationProvider` to the Provider Abstraction table: a Port exposing `attest(deviceContext) → AttestationResult { verdict: TRUSTED | UNTRUSTED | UNKNOWN, provider, checkedAt }`, with adapters for Play Integrity (Android) and App Attest (iOS) behind one interface. `TrustSignalEvaluator` and `DataQualityComponentEvaluator` implementations consume `AttestationResult` as one more signal input, exactly like any other Port-provided data — never calling the underlying SDK directly. No adapter is required to exist yet (attestation-gated guest reward accrual remains an explicitly deferred Phase 6+ hardening item per ADR-0009); this ADR only ensures the *seam* exists so that work, when it happens, is an adapter addition rather than a principle violation.

## Consequences

- **Positive:** closes a real gap between stated principle (ADR-0003) and actual design coverage; when attestation is eventually built, it's a normal Provider Abstraction addition, not a special case.
- **Negative:** none of substance — this is a zero-cost-now, pure documentation/interface-reservation fix, the cheapest category of finding in this audit.
