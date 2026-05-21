/**
 * Parsed information about the first API Gateway error found in an
 * AccessLog query.
 *
 * Produced by {@link parseApiGwErrors} and exposed as the typed `output`
 * of the corresponding step. Fields beyond `errorCount`, `xRayTraceId`
 * and `statusCode` mirror the columns of the canonical AccessLog
 * display: every field is optional because not every API Gateway
 * configuration emits all of them.
 */
export interface ApiGwErrorInfo {
  /** Number of rows whose status code crosses the configured threshold */
  readonly errorCount: number;
  /** X-Ray trace id extracted from the first error row, if available */
  readonly xRayTraceId: string | undefined;
  /** HTTP status code of the first error row (string for var-map coherence) */
  readonly statusCode: string;
  /** `errorMessage` field of the first error row, if present */
  readonly errorMessage?: string;
  /** `httpMethod` field of the first error row, if present */
  readonly httpMethod?: string;
  /** `path` field of the first error row, if present */
  readonly path?: string;
  /** `authorizerStatus` field of the first error row, if present */
  readonly authorizerStatus?: string;
  /** `authorizerLatency` field of the first error row, if present */
  readonly authorizerLatency?: string;
  /** `authorizerRequestId` field of the first error row, if present */
  readonly authorizerRequestId?: string;
  /** `integrationServiceStatus` field of the first error row, if present */
  readonly integrationServiceStatus?: string;
  /** `requestId` field of the first error row, if present */
  readonly requestId?: string;
  /** `integrationRequestId` field of the first error row, if present */
  readonly integrationRequestId?: string;
}
