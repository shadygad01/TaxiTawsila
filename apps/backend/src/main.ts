// Tracing bootstrap MUST be the very first import (ADR-0027) — OpenTelemetry
// auto-instrumentation patches Node's built-in modules (http, pg, ...) and
// must run before anything else requires them.
import { bootstrapTracing } from './common/monitoring/tracing.bootstrap';
bootstrapTracing();

import 'reflect-metadata';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({
    origin: (process.env.CORS_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

bootstrap().catch((error) => {
  console.error('Fatal error during bootstrap', error);
  process.exit(1);
});
