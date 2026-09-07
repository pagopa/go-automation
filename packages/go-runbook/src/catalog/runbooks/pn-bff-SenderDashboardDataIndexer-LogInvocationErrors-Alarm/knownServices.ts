import type { lambda } from '../framework.js';

/**
 * The CloudFormation definition configures a 900-second timeout and a daily
 * EventBridge schedule. The Confluence runbook confirms the log-group name.
 */
export const LAMBDA_FUNCTION: lambda.LambdaFunction = {
  name: 'pn-bff-SenderDashboardDataIndexer',
  logGroup: '/aws/lambda/pn-bff-SenderDashboardDataIndexer',
  varPrefix: 'senderDashboardDataIndexer',
  eventSource: 'scheduled',
  configuredTimeoutMs: 900_000,
};

/**
 * The current runbook leaves "Servizi e downstream coinvolti" empty. DataLake
 * supplies S3 objects but is not a requestId-correlatable Lambda downstream,
 * so no downstream log query is declared.
 */
export const DOWNSTREAMS: ReadonlyArray<lambda.LambdaDownstream> = [];
