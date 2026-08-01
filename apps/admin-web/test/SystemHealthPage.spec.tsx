import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SystemHealthPage } from '../src/app/SystemHealthPage';
import * as backendClient from '../src/shared/api-client/backend-client';

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('SystemHealthPage', () => {
  it('renders the backend health status once loaded', async () => {
    vi.spyOn(backendClient, 'fetchSystemHealth').mockResolvedValue({ status: 'ok' });

    renderWithQueryClient(<SystemHealthPage />);

    await waitFor(() => expect(screen.getByText(/Status: ok/)).toBeTruthy());
  });

  it('renders an error message if the health check fails', async () => {
    vi.spyOn(backendClient, 'fetchSystemHealth').mockRejectedValue(new Error('connection refused'));

    renderWithQueryClient(<SystemHealthPage />);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('connection refused'));
  });
});
