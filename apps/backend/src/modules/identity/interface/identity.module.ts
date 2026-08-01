import { Module } from '@nestjs/common';

/**
 * Identity Context (Domain Model §2). Manages passenger identity across the guest -> registered lifecycle. Phase 2 deliberately implements NO business logic here — OTP/Google/Apple auth flows, guest-to-registered promotion, and the merge-on-registration rule (ADR-0009) are excluded from Phase 2's scope by name (see docs/21-phase2-foundation-audit.md). This module exists as a wired, empty stub so the module boundary and its migration ownership (identity schema) are established now, per Folder Structure §2.
 */
@Module({})
export class IdentityModule {}
