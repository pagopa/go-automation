import type { ExecuteRunbookDelivery } from '../types/ExecuteRunbookDelivery.js';

export const LEGACY_SYNTHETIC_DELIVERY_GRACE_MS: number = 12 * 60_000;
export const CLI_SYNTHETIC_DELIVERY_GRACE_MS: number = 120_000;

export interface SyntheticDeliveryOptions {
  readonly graceMs: number;
  readonly nowMs?: number;
}

export function syntheticDelivery(executionId: string, options: SyntheticDeliveryOptions): ExecuteRunbookDelivery {
  const nowMs = options.nowMs ?? Date.now();
  return {
    sqsMessageId: `cli:${executionId}`,
    approximateReceiveCount: 1,
    workerDeadlineAt: new Date(nowMs + options.graceMs).toISOString(),
  };
}
