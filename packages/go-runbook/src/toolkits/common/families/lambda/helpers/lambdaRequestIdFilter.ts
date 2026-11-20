/** Placeholder of the invocation query replaced by the predicate of a batch of request ids. */
export const REQUEST_ID_FILTER_PLACEHOLDER: string = '{{REQUEST_ID_FILTER}}';

/** A Lambda request id: what may enter a predicate without escaping. */
export const LAMBDA_REQUEST_ID: RegExp = /^[A-Za-z0-9-]{1,128}$/u;

/**
 * The invocation query of a batch of request ids: the template with one predicate per id, combined in `OR`, on the
 * structured `@requestId` or on the message.
 *
 * @param template - Query with the `{{REQUEST_ID_FILTER}}` placeholder
 * @param requestIds - Request ids of the batch, each a {@link LAMBDA_REQUEST_ID}
 * @returns The query
 * @throws Error when a request id is not a Lambda request id
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
  return template.replace(REQUEST_ID_FILTER_PLACEHOLDER, filter);
}
