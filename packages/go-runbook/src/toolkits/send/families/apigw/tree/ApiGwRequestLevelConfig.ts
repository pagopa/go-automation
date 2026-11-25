import type { AccessLogSchema } from '../../../../common/families/apigw/accessLog/AccessLogSchema.js';

/** How the root level of a SEND API Gateway runbook divides the access log into requests. */
export interface ApiGwRequestLevelConfig {
  /** Step that read the access log. */
  readonly accessLogStepId: string;
  /** Step that read the execution log, whose rows carry the `requestId` of their request. */
  readonly executionLogStepId?: string;
  /** Lowest status of a request in error. */
  readonly minStatusCode: number;
  readonly schema: AccessLogSchema;
}
