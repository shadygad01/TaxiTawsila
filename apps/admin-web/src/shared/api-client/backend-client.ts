/**
 * Typed API client (Folder Structure §4: "generated from OpenAPI" once the
 * backend exposes a real OpenAPI schema — Phase 3+, `@nestjs/swagger`, API
 * Specification §10). Phase 2 hand-writes the one endpoint that actually
 * exists: `/admin/system/health`.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export interface HealthCheckResponse {
  status: string;
  info?: Record<string, { status: string }>;
  error?: Record<string, { status: string }>;
  details?: Record<string, { status: string }>;
}

export async function fetchSystemHealth(): Promise<HealthCheckResponse> {
  const response = await fetch(`${API_BASE_URL}/admin/system/health`);
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  return response.json() as Promise<HealthCheckResponse>;
}
