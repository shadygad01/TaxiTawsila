import { useQuery } from '@tanstack/react-query';
import { fetchSystemHealth } from '../shared/api-client/backend-client';

/**
 * The one real, working page in Phase 2 — proves the admin-web -> backend
 * wiring (API client, React Query, build/lint/typecheck) end to end without
 * touching any excluded business feature.
 */
export function SystemHealthPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['system-health'],
    queryFn: fetchSystemHealth,
  });

  if (isLoading) return <p>Checking backend health…</p>;
  if (isError) return <p role="alert">Backend health check failed: {(error as Error).message}</p>;

  return (
    <section>
      <h2>System Health</h2>
      <p>Status: {data?.status}</p>
    </section>
  );
}
