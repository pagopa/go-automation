/**
 * Generic retry helper with exponential backoff for AWS SDK calls.
 */

const RETRYABLE_NAMES = new Set([
  'ProvisionedThroughputExceededException',
  'LimitExceededException',
  'InternalServerError',
  'ServiceUnavailable',
  'RequestTimeoutException',
]);

const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT']);

type RetryOperationHandler<T> = () => Promise<T>;

/**
 * Executes an async operation with exponential backoff on retryable errors.
 *
 * @param operation - Async function to execute
 * @param maxAttempts - Maximum number of attempts (default 5)
 * @returns The operation result
 * @throws The last error if all attempts fail or a non-retryable error occurs
 */
export async function withRetry<T>(operation: RetryOperationHandler<T>, maxAttempts = 5): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;

      const errorObj = error as Record<string, unknown>;
      const errorName = typeof errorObj['name'] === 'string' ? errorObj['name'] : '';
      const errorCode = typeof errorObj['code'] === 'string' ? errorObj['code'] : '';

      if (RETRYABLE_NAMES.has(errorName) || RETRYABLE_CODES.has(errorCode)) {
        const delay = Math.pow(2, attempt) * 100;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}
