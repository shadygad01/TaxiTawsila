import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';

/**
 * `/admin/system/health` (API Specification §7). Aggregates infra-level checks
 * now (database); per-module business-health signals are added by each module
 * as it's built (Architecture §9).
 */
@Controller('admin/system/health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }
}
