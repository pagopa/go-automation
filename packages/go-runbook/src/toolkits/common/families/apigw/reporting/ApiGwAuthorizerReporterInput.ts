import type { ApiGwAuthorizerFailureOutcome } from '../steps/ApiGwAuthorizerFailureOutcome.js';

export interface ApiGwAuthorizerReporterInput {
  readonly lambdaName: string;
  readonly authorizerStatus?: string;
  readonly authorizerLatencyMs?: number;
  readonly authorizerRequestId?: string;
  readonly timeoutMs?: number;
  readonly path?: string;
  readonly httpMethod?: string;
  readonly outcome: ApiGwAuthorizerFailureOutcome | 'none';
  readonly failureType?: string;
}
