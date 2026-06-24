export type GOHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Retry contract for explicitly idempotent HTTP operations. */
export interface GOHttpRetryPolicy {
  readonly enabled: true;
  readonly idempotencyKey: string;
  readonly maxAttempts: 3;
  readonly retryableStatuses: readonly [408, 429, 500, 502, 503, 504];
  readonly respectRetryAfter: true;
  readonly maxRetryAfterMs: 15_000;
}

/** Per-logical-request controls. Absence of retryPolicy means one transmission. */
export interface GOHttpRequestOptions {
  readonly retryPolicy?: GOHttpRetryPolicy;
  /** Absolute wall-clock deadline shared by every attempt and auth replay. */
  readonly deadlineAtMs?: number;
  /** Remaining transmissions in a larger logical callback budget. */
  readonly attemptBudget?: 1 | 2 | 3;
  readonly signal?: AbortSignal;
}

/** Response data plus the number of HTTP transmissions consumed. */
export interface GOHttpResponse<T> {
  readonly data: T;
  readonly statusCode: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  readonly attemptsUsed: number;
}
