import { Module } from '@nestjs/common';

/**
 * Trip Context (Domain Model §3). Owns the full trip lifecycle: estimate -> live tracking -> completion. Phase 2 excludes Trip, Fare estimation, Maps, GPS, and Tracking by name — this module is a wired, empty stub only, establishing the module boundary and its migration ownership (trip schema) ahead of Phase 5.
 */
@Module({})
export class TripModule {}
