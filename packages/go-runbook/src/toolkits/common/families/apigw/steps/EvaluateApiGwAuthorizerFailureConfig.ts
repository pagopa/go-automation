import type { AccessLogSchema } from '../accessLog/AccessLogSchema.js';
import type { ApiGwAuthorizerFailureCheckConfig } from '../types/ApiGwAuthorizerFailureCheckConfig.js';

export interface EvaluateApiGwAuthorizerFailureConfig {
  readonly id: string;
  readonly label: string;
  readonly fromStep: string;
  readonly schema: AccessLogSchema;
  readonly check: ApiGwAuthorizerFailureCheckConfig;
  readonly queryProfileId: string;
}
