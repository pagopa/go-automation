/**
 * Known services for the pn-tokenExchangeLambda-LogInvocationErrors-Alarm runbook.
 */

import type { lambda } from '@go-automation/go-runbook';

/** Entry Lambda whose log group is the primary source. */
export const LAMBDA_FUNCTION: lambda.LambdaFunction = {
  name: 'pn-tokenExchangeLambda',
  logGroup: '/aws/lambda/pn-tokenExchangeLambda',
  varPrefix: 'tokenExchange',
};

/**
 * Downstream microservices reachable from the Lambda. Each entry is queried
 * by the Lambda requestId only when a {@link lambda.DownstreamErrorPattern}
 * (see knownErrors.ts) routes to it and a `logGroup` is provided.
 *
 * TODO: add reachable downstream services as the analysis surfaces them.
 */
export const DOWNSTREAMS: ReadonlyArray<lambda.LambdaDownstream> = [
  {
    name: 'pn-emd-integration',
    varPrefix: 'emdIntegration',
    // logGroup omesso di proposito: il requestId della Lambda non è garantito
    // nei log applicativi di pn-emd-integration (open point). L'analisi usa il
    // flusso della Lambda (query-lambda-invocation) per i dettagli dell'errore.
  },
];
