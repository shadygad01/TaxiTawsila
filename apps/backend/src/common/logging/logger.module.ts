import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { getCurrentCorrelationId } from './correlation-id.context';

/**
 * Structured JSON logging (Architecture §9). Every log line is tagged with the
 * request's correlationId (ADR-0027) via a mixin, so logs alone — without a
 * tracing backend — can reconstruct which lines belong to the same request or
 * the same async chain it triggered (Trip -> Outbox -> Trust/Data Quality ->
 * Reward). Never logs at INFO+ with raw PII/secrets (Security Model §4) — that
 * remains a code-review discipline (Coding Standards), not something this
 * module can enforce mechanically.
 */
@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        mixin: () => ({ correlationId: getCurrentCorrelationId() }),
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.otp', '*.phoneNumber'],
          censor: '[REDACTED]',
        },
        autoLogging: true,
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
