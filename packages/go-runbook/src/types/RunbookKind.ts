/**
 * Family of a runbook: the analysis it performs, which is also the toolkit
 * that builds it.
 *
 * - `APIGW`: correlates an API Gateway access log with the services behind it.
 * - `LAMBDA`: reads a Lambda's invocation and error logs.
 * - `SERVICE`: reads a service's application logs.
 * - `DOWNSTREAM`: looks for the downstream markers those logs carry.
 * - `K8S`: reads the application logs of a pod.
 *
 * The catalog publishes this value, so a consumer validating against the
 * published schema only accepts the members declared here.
 */
export const RunbookKinds = {
  APIGW: 'APIGW',
  LAMBDA: 'LAMBDA',
  SERVICE: 'SERVICE',
  DOWNSTREAM: 'DOWNSTREAM',
  K8S: 'K8S',
} as const;

export type RunbookKind = (typeof RunbookKinds)[keyof typeof RunbookKinds];
