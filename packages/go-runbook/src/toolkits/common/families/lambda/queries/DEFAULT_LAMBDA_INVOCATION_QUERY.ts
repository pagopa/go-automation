/**
 * CloudWatch Logs Insights query that reconstructs the invocation flow of a batch of Lambda request ids. The
 * `{{REQUEST_ID_FILTER}}` placeholder is replaced by one predicate per request id, combined in `OR`
 * (`lambdaRequestIdFilter`).
 */
export const DEFAULT_LAMBDA_INVOCATION_QUERY: string = `fields @timestamp, @requestId, @message
| filter {{REQUEST_ID_FILTER}}
| sort @timestamp asc
| limit 1000`;
