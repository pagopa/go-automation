import type { ApiGwAuthorizerLambdaConfig } from '../types/ApiGwAuthorizerLambdaConfig.js';

export interface AuthorizerEvidence {
  readonly authorizer: ApiGwAuthorizerLambdaConfig;
  readonly authorizerStatus?: string;
  readonly latencyMs?: number;
  readonly requestId?: string;
  readonly path?: string;
  readonly httpMethod?: string;
}
