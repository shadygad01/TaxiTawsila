import { Module } from '@nestjs/common';

/**
 * Fare Policy Context (ADR-0021). Owns fare business rules — government fare policy, base fare, distance/waiting/time-of-day rules, special adjustments — independent of Trip's estimation orchestration. Phase 2 excludes Fare estimation by name; this module is a wired, empty stub establishing the module boundary and its migration ownership (farepolicy schema) ahead of Phase 5.
 */
@Module({})
export class FarePolicyModule {}
