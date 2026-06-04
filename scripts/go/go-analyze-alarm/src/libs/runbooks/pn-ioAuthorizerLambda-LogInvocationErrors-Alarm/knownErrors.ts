/**
 * Downstream error patterns for the pn-ioAuthorizerLambda-LogInvocationErrors-Alarm runbook.
 *
 * The Lambda analog of API Gateway known URLs: a pattern matched in the
 * Lambda error message routes the analysis to a downstream microservice
 * (declared in knownServices.ts) and sets `vars.lambdaDownstreamTarget`.
 *
 * TODO: populate when the Lambda calls downstream microservices.
 */
import type { lambda } from '@go-automation/go-runbook';

export const DOWNSTREAM_ERROR_PATTERNS: ReadonlyArray<lambda.DownstreamErrorPattern> = [
  // {
  //   pattern: 'External service pn-some-service returned errors',
  //   target: 'pn-some-service',
  //   description: 'Errore restituito dal servizio downstream pn-some-service.',
  // },
];
