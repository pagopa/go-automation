import type { ApiGwAuthorizerFailureOutcome } from './ApiGwAuthorizerFailureOutcome.js';
import type { ApiGwAuthorizerFailureType } from './ApiGwAuthorizerFailureType.js';

export interface ApiGwAuthorizerFailureInfo {
  readonly outcome: ApiGwAuthorizerFailureOutcome;
  readonly failureType: ApiGwAuthorizerFailureType;
  readonly lambdaName: string;
  readonly authorizerStatus: string;
  readonly timeoutMs: number;
  readonly latencyMs?: number;
  readonly requestId?: string;
  readonly path?: string;
  readonly httpMethod?: string;
}
