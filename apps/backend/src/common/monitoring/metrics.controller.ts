import { Controller, Get, Header } from '@nestjs/common';
import { register } from 'prom-client';

/**
 * `/metrics` Prometheus exposition endpoint (Architecture §9, Deployment
 * Strategy §6). `metrics.module.ts` registers default Node.js process metrics
 * on boot; module-specific metrics (Trust verdict distribution, reward-grant
 * rate, outbox dead-letter arrivals — Pre-Implementation Audit §7) are
 * registered by each module as it's built, against this same default registry.
 */
@Controller('metrics')
export class MetricsController {
  @Get()
  @Header('Content-Type', register.contentType)
  async getMetrics(): Promise<string> {
    return register.metrics();
  }
}
