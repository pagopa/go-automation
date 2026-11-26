import { renderQueryTemplate } from '../../../queries/renderQueryTemplate.js';

/** Placeholder of the invocation query replaced by the predicate of a batch of request ids. */
export const REQUEST_ID_FILTER_PLACEHOLDER: string = '{{REQUEST_ID_FILTER}}';

/** A Lambda request id: what may enter a predicate without escaping. */
export const LAMBDA_REQUEST_ID: RegExp = /^[A-Za-z0-9-]{1,128}$/u;

/** Request ids per invocation query. */
export const INVOCATION_BATCH_SIZE = 25;

/** Request id of the sample query a step shows in its trace. */
const SAMPLE_REQUEST_ID = '00000000-0000-0000-0000-000000000000';

/**
 * The invocation query of a batch of request ids: the template with one predicate per id, combined in `OR`, on the
 * structured `@requestId` or on the message.
 *
 * @param template - Query with the `{{REQUEST_ID_FILTER}}` placeholder
 * @param requestIds - Request ids of the batch, each a {@link LAMBDA_REQUEST_ID}
 * @returns The query
 * @throws Error when a request id is not a Lambda request id, or the template has no placeholder
 *
 * @example
 * ```typescript
 * lambdaInvocationQuery('fields @message | filter {{REQUEST_ID_FILTER}}', ['req-1']);
 * // "fields @message | filter (@requestId = 'req-1' or @message like 'req-1')"
 * ```
 */
export function lambdaInvocationQuery(template: string, requestIds: ReadonlyArray<string>): string {
  const filter = requestIds
    .map((requestId) => {
      if (!LAMBDA_REQUEST_ID.test(requestId)) throw new Error('invalid Lambda requestId');
      return `(@requestId = '${requestId}' or @message like '${requestId}')`;
    })
    .join(' or ');
  return renderQueryTemplate(template, {
    values: { [REQUEST_ID_FILTER_PLACEHOLDER]: filter },
    queryId: 'lambda.invocation',
  });
}

/**
 * The invocation query of a sample request id, as a step shows it in its trace.
 *
 * @param template - Query with the `{{REQUEST_ID_FILTER}}` placeholder
 * @returns The query of the sample request id
 *
 * @example
 * ```typescript
 * sampleLambdaInvocationQuery(DEFAULT_LAMBDA_INVOCATION_QUERY);
 * ```
 */
export function sampleLambdaInvocationQuery(template: string): string {
  return lambdaInvocationQuery(template, [SAMPLE_REQUEST_ID]);
}
