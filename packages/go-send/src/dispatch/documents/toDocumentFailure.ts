import { GOHttpClientError } from '@go-automation/go-common/core';

import { DispatchError } from '../DispatchError.js';
import type { DocumentFailure } from './DocumentFailure.js';
import { UploadError } from './UploadError.js';

/** Codes of `DispatchError` that a later `--retry-failed` cannot fix (the input is fixed). */
const NON_RETRYABLE_CODES: ReadonlySet<string> = new Set(['PRATICA_EMPTY', 'PRATICA_UNKNOWN']);

/** Codes of `DispatchError` that would hit every row: the run must stop. */
const RUN_LEVEL_CODES: ReadonlySet<string> = new Set(['CONFIGURATION']);

/**
 * Classifies a rejection of `DocumentResolver.resolve`. Pure.
 *
 * - `UploadError`: row error with its code; a preload rejected with `401` /
 *   `403` (API key) is also a run-level error.
 * - `DispatchError`: row error with its code; `CONFIGURATION` (no SafeStorage
 *   gateway) is also a run-level error; `PRATICA_*` are not retryable.
 * - Anything else is not a document problem (e.g. the journal can no longer
 *   be written): `undefined`, the caller must rethrow it.
 *
 * @param error - Rejection of the resolver
 * @returns The failure, or `undefined` for an unexpected error
 */
export function toDocumentFailure(error: unknown): DocumentFailure | undefined {
  if (error instanceof UploadError) {
    const rowError = { code: error.code, message: error.message, retryable: true };
    const status = error.cause instanceof GOHttpClientError ? error.cause.statusCode : undefined;
    if (status !== 401 && status !== 403) return { rowError };
    return {
      rowError,
      runError: new DispatchError(`HTTP_${status}`, `SafeStorage rejected the API key: ${error.message}`, {
        cause: error,
      }),
    };
  }
  if (error instanceof DispatchError) {
    const rowError = { code: error.code, message: error.message, retryable: !NON_RETRYABLE_CODES.has(error.code) };
    return RUN_LEVEL_CODES.has(error.code) ? { rowError, runError: error } : { rowError };
  }
  return undefined;
}
