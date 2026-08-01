import { z } from 'zod';

/**
 * Environment-specific config validated at startup against a strict schema
 * (Deployment Strategy §8) — fail fast on missing/malformed config rather
 * than degrading silently or crashing deep inside a request handler.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['local', 'staging', 'production', 'test']).default('local'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_HOST: z.string().min(1).default('localhost'),
  DATABASE_PORT: z.coerce.number().int().positive().default(5432),
  DATABASE_NAME: z.string().min(1).default('taxitawsila'),
  DATABASE_USER: z.string().min(1).default('postgres'),
  DATABASE_PASSWORD: z.string().default('postgres'),

  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  JWT_ACTIVE_KID: z.string().min(1).default('dev-key-1'),
  JWT_SECRET: z.string().min(16).default('dev-only-insecure-secret-change-me'),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(raw: NodeJS.ProcessEnv): EnvConfig {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
