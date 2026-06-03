/**
 * CloudWatch Logs Insights query that reconstructs the full invocation
 * flow for a single Lambda `requestId`. The `{{vars.lambdaRequestId}}`
 * placeholder is interpolated at execution time.
 */
export const DEFAULT_LAMBDA_INVOCATION_QUERY: string = `fields @timestamp, @message
| filter @message like '{{vars.lambdaRequestId}}'
| sort @timestamp asc
| limit 1000`;
