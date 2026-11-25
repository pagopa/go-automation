import type { ApiGwAuthorizerOutcome } from './ApiGwAuthorizerOutcome.js';

export interface ApiGwAuthorizerOutput {
  readonly lambdaName?: string;
  readonly timeoutMs?: number;
  readonly status?: string;
  readonly latencyMs?: number;
  readonly requestId?: string;
  readonly outcome?: ApiGwAuthorizerOutcome;
}
