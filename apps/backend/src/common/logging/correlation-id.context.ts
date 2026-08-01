import { AsyncLocalStorage } from 'node:async_hooks';

export interface CorrelationContext {
  correlationId: string;
}

export const correlationIdStorage = new AsyncLocalStorage<CorrelationContext>();

/**
 * Reads the current request's correlationId, wherever this is called from on
 * that request's async call stack. Falls back to 'unset' outside a request
 * context (e.g. a boot-time log line) rather than throwing — logging must
 * never be the thing that crashes a request.
 */
export function getCurrentCorrelationId(): string {
  return correlationIdStorage.getStore()?.correlationId ?? 'unset';
}
