/**
 * Trigger that invokes the Lambda. Informational: it does not change the
 * analysis pipeline, but it is surfaced in the output and can hint at
 * follow-up checks (e.g. SQS retries/DLQ for `sqs`).
 */
export type LambdaEventSource = 'api-gateway-authorizer' | 'sqs' | 'scheduled' | 'unknown';
