import { getErrorMessage } from '@pagopa/go-common/errors';
import { GOHttpClientError } from '@pagopa/go-common/http';
import { isPlainObject } from '@pagopa/go-common/utils';

import type { ProblemErrorItem } from './ProblemErrorItem.js';
import type { SendFailure } from './SendFailure.js';

/** 400 codes that would hit every row: they stop the run (§8.1.4). */
const GLOBAL_400_CODES: ReadonlySet<string> = new Set([
  'PN_DELIVERY_INVALIDPARAMETER_GROUP',
  'PN_DELIVERY_NOTIFICATION_LIMIT_EXCEEDED',
  'PN_DELIVERY_SEND_IS_DISABLED',
]);

/** Separator of the composite keys in `errors[].element` of a 409. */
const KEY_SEPARATOR = '##';

/**
 * Classifies a failed `POST requests` (§8.1.4). Pure.
 *
 * Transport errors (no status: timeout, connection reset, DNS…) are
 * classified as `ambiguous`: the HTTP client does not tell whether the body
 * was sent, and the reconciliation by protocol is safe in every case.
 *
 * @param error - Rejection of the send call
 * @returns The classified failure
 */
export function classifySendFailure(error: unknown): SendFailure {
  if (!(error instanceof GOHttpClientError) || error.statusCode === undefined) {
    return { kind: 'ambiguous', code: 'TRANSPORT_ERROR', message: getErrorMessage(error) };
  }

  const status = error.statusCode;
  const errors = problemErrors(error.response);
  const details = errors.length > 0 ? JSON.stringify(errors) : undefined;
  const firstCode = errors.find((item) => item.code !== undefined)?.code;
  const message = problemMessage(error.response) ?? error.message;
  const base = { status, message, ...(details !== undefined && { details }) };

  if (status === 429) {
    return { ...base, kind: 'throttled', code: 'THROTTLED', ...retryAfter(error) };
  }
  if (status === 401 || status === 403) {
    return { ...base, kind: 'global', code: firstCode ?? `HTTP_${status}` };
  }
  if (status === 409) {
    const noticeCodeDuplicate = errors.some((item) => item.element?.split(KEY_SEPARATOR).length === 2);
    return noticeCodeDuplicate
      ? { ...base, kind: 'row', code: 'DUPLICATE_NOTICE_CODE' }
      : { ...base, kind: 'duplicate', code: firstCode ?? 'DUPLICATE' };
  }
  if (status === 408 || status >= 500) {
    return { ...base, kind: 'ambiguous', code: `HTTP_${status}`, ...retryAfter(error) };
  }
  if (status === 400 && firstCode !== undefined && GLOBAL_400_CODES.has(firstCode)) {
    return { ...base, kind: 'global', code: firstCode };
  }
  return { ...base, kind: 'row', code: firstCode ?? `HTTP_${status}` };
}

function problemErrors(body: unknown): ReadonlyArray<ProblemErrorItem> {
  if (!isPlainObject(body)) return [];
  const errors = body['errors'];
  if (!Array.isArray(errors)) return [];
  const items: ReadonlyArray<unknown> = errors;
  return items.filter(isPlainObject).map((item) => ({
    ...(typeof item['code'] === 'string' && { code: item['code'] }),
    ...(typeof item['element'] === 'string' && { element: item['element'] }),
    ...(typeof item['detail'] === 'string' && { detail: item['detail'] }),
  }));
}

function problemMessage(body: unknown): string | undefined {
  if (!isPlainObject(body)) return typeof body === 'string' && body !== '' ? body : undefined;
  const parts = [body['title'], body['detail']].filter(
    (part): part is string => typeof part === 'string' && part !== '',
  );
  return parts.length > 0 ? parts.join(': ') : undefined;
}

function retryAfter(error: GOHttpClientError): { readonly retryAfterMs?: number } {
  return error.retryAfterMs === undefined ? {} : { retryAfterMs: error.retryAfterMs };
}
