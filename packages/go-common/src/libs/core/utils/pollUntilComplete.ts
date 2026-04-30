/**
 * Generic polling utility for async operations that require
 * repeated status checks until a terminal condition is reached.
 *
 * Used by: CloudWatchLogsService, AthenaService, AthenaQueryExecutor.
 */

/** Default maximum polling attempts */
export const DEFAULT_MAX_POLL_ATTEMPTS = 60;

/** Default base interval in ms for exponential backoff */
export const DEFAULT_BACKOFF_BASE_MS = 500;

/** Default cap interval in ms for exponential backoff */
export const DEFAULT_BACKOFF_CAP_MS = 3000;

/**
 * Backoff strategy: given a zero-based attempt number, returns ms to wait.
 */
export type BackoffFn = (attempt: number) => number;

/**
 * Progress info passed to the onAttempt callback.
 */
export interface PollAttemptInfo {
  /** Zero-based attempt number */
  readonly attempt: number;
  /** Milliseconds elapsed since polling started */
  readonly elapsedMs: number;
}

type SleepFn = (ms: number) => Promise<void>;

type PollAttemptHandler = (info: PollAttemptInfo) => void;
type PollCheckHandler<T> = (attempt: number) => Promise<T | undefined>;

/**
 * Polling configuration.
 */
export interface PollOptions {
  /** Max attempts before timeout error (default: DEFAULT_MAX_POLL_ATTEMPTS) */
  readonly maxAttempts?: number;
  /** Backoff strategy (default: exponentialBackoff()) */
  readonly backoff?: BackoffFn;
  /** Abort signal for cancellation */
  readonly signal?: AbortSignal;
  /** Sleep implementation — injectable for testing */
  readonly sleepFn?: SleepFn;
  /** Called after each non-terminal attempt */
  readonly onAttempt?: PollAttemptHandler;
}

/**
 * Creates an exponential backoff function.
 * Sequence with defaults: 500 → 1000 → 2000 → 3000 → 3000...
 *
 * @param baseMs - Base interval in ms (default: DEFAULT_BACKOFF_BASE_MS)
 * @param capMs - Maximum interval in ms (default: DEFAULT_BACKOFF_CAP_MS)
 * @returns A backoff function
 */
export function exponentialBackoff(
  baseMs: number = DEFAULT_BACKOFF_BASE_MS,
  capMs: number = DEFAULT_BACKOFF_CAP_MS,
): BackoffFn {
  return (attempt) => Math.min(baseMs * 2 ** attempt, capMs);
}

/**
 * Creates a fixed-interval backoff function.
 * Returns the same interval regardless of attempt number.
 *
 * @param intervalMs - Fixed interval in ms
 * @returns A backoff function
 */
export function fixedBackoff(intervalMs: number): BackoffFn {
  return () => intervalMs;
}

/**
 * Polls check() until it returns a defined value.
 *
 * - Return T from check → polling stops, T is returned
 * - Return undefined from check → polling continues to next attempt
 * - Throw from check → error propagated immediately (terminal failure)
 *
 * @param options - Polling configuration
 * @param check - Async function called each attempt; return T to stop, undefined to continue
 * @returns The first defined value returned by check
 * @throws On timeout, abort, or error thrown by check
 *
 * @example
 * ```typescript
 * const result = await pollUntilComplete({}, async () => {
 *   const response = await client.getStatus(id);
 *   if (response.status === 'Complete') return response.data;
 *   if (response.status === 'Failed') throw new Error('Failed');
 *   return undefined; // keep polling
 * });
 * ```
 */
export async function pollUntilComplete<T>(options: PollOptions, check: PollCheckHandler<T>): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;
  const backoff = options.backoff ?? exponentialBackoff();
  const signal = options.signal;
  const sleepFn = options.sleepFn ?? defaultSleep;
  const startMs = Date.now();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted === true) {
      throw new Error('Polling aborted');
    }

    const result = await check(attempt);

    if (result !== undefined) {
      return result;
    }

    options.onAttempt?.({
      attempt,
      elapsedMs: Date.now() - startMs,
    });

    if (attempt < maxAttempts - 1) {
      await sleepFn(backoff(attempt));
    }
  }

  throw new Error(`Polling timed out after ${maxAttempts} attempts`);
}

/**
 * Default sleep using setTimeout.
 *
 * @param ms - Milliseconds to wait
 */
async function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
