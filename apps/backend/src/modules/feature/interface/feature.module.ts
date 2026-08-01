import { Module } from '@nestjs/common';

/**
 * Feature Management Context (Domain Model §10, ADR-0018). Toggles, percentage rollouts, kill switches, segments, experiments. Not part of Phase 2's explicit deliverable list (Configuration Platform was named, Feature Management was not) — this module is a wired, empty stub establishing the module boundary and its migration ownership (feature schema) ahead of Phase 3's full build-out.
 */
@Module({})
export class FeatureModule {}
