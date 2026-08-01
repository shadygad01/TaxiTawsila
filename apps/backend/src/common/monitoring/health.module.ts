import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

/**
 * Health endpoints per module, aggregated (Architecture §9, Deployment
 * Strategy §6). Phase 2 wires the aggregation point and the two infra checks
 * that already exist (database, Redis) — per-module health contributions
 * (Trust Engine anomaly rate, Data Quality readiness distribution, etc.) are
 * added by each module as it's built, not invented here on their behalf.
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
