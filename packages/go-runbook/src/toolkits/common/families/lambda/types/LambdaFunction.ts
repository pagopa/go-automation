import type { LambdaEventSource } from './LambdaEventSource.js';

/**
 * Entry Lambda analysed by a Lambda alarm runbook.
 *
 * The mapping `name → logGroup` lives inline so each runbook stays
 * self-contained, mirroring `apigw.ApiGwService`.
 */
export interface LambdaFunction {
  /** Canonical Lambda function name (e.g. `pn-tokenExchangeLambda`). */
  readonly name: string;
  /** CloudWatch Logs group of the function (e.g. `/aws/lambda/<name>`). */
  readonly logGroup: string;
  /** Prefix used for the context vars produced by the analysis steps. */
  readonly varPrefix: string;
  /** Trigger that invokes the Lambda (informational). */
  readonly eventSource?: LambdaEventSource;
  /**
   * Configured Lambda timeout in milliseconds, optional.
   *
   * There is no AWS Lambda service in the runbook `ServiceRegistry`, so the
   * runbook never calls `GetFunctionConfiguration`: timeout/memory are
   * inferred from the `REPORT` log line. When provided, this value is
   * propagated to the `lambdaConfiguredTimeoutMs` var (so timeout known cases
   * can reference it) and to `details.lambda.configuredTimeoutMs` in the
   * result output, to compare against the observed `Duration`.
   */
  readonly configuredTimeoutMs?: number;
}
