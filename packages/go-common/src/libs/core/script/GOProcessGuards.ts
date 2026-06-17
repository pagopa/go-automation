/**
 * GOProcessGuards - Process-level last-resort fault handlers
 *
 * Registers process-global listeners that catch faults escaping the normal
 * script lifecycle (background async work, promises that reject after the
 * handler returned, timers, module-load faults) and log them as a single
 * structured JSON line BEFORE the process dies.
 *
 * Why this matters:
 * - Without these, an unhandled rejection / uncaught exception is either
 *   swallowed or reported by the runtime with a vague message (in AWS Lambda:
 *   "exited without providing a reason" / a timeout), masking the real fault.
 * - Registering an `uncaughtException`/`unhandledRejection` listener suppresses
 *   Node's default crash, so without an explicit `process.exit(1)` the program
 *   would hang. `exitOnFatal` controls that terminal action.
 *
 * Design notes:
 * - Registration is a process-global singleton (idempotent across GOScript
 *   instances and warm Lambda invocations): listeners are installed once and
 *   never removed, so they survive container reuse.
 * - Logging uses raw `console` with structured JSON (not GOLogger) on purpose:
 *   these are fatal paths where depending on logger state is risky, and the
 *   runtime captures stdout/stderr (CloudWatch, etc.).
 */

import { valueToString } from '../utils/GOValueToString.js';

/**
 * Options for {@link installProcessGuards}.
 */
export interface GOProcessGuardsOptions {
  /**
   * Call `process.exit(1)` after logging a fatal fault
   * (unhandledRejection / uncaughtException). Default: true.
   *
   * Entry points (CLI / Lambda) want this; it is the parameter that keeps a
   * library from killing an embedding process against its will.
   */
  readonly exitOnFatal?: boolean;

  /**
   * Also register a `beforeExit` diagnostic listener. Default: false.
   *
   * Only useful in long-lived/managed runtimes (e.g. AWS Lambda warm
   * containers) where `beforeExit` firing mid-work signals a leaked handle.
   * In a CLI it would log on every normal exit, so it is opt-in.
   */
  readonly includeBeforeExit?: boolean;
}

// Process-global state: guards are installed once per process, not per instance.
let installed = false;
let currentRequestId: string | null = null;

/**
 * Set the identifier attributed to subsequent fault logs (e.g. the Lambda
 * `awsRequestId`). Pass `null` to clear it between invocations so a background
 * fault that fires between requests is not misattributed to the previous one.
 *
 * @param requestId - Identifier for the in-flight invocation, or null
 */
export function setProcessGuardRequestId(requestId: string | null): void {
  currentRequestId = requestId;
}

/**
 * Serialize an unknown thrown value into a plain object suitable for JSON logs.
 * Errors keep name/message/stack; anything else is rendered via valueToString
 * (handles circular refs, BigInt, Symbol, Map/Set, etc.), preserving the
 * literal "null"/"undefined" so a `throw null` / `Promise.reject()` stays
 * diagnosable.
 *
 * @param err - The thrown value of unknown type
 * @returns A JSON-serializable representation
 */
export function serializeError(err: unknown): Record<string, unknown> {
  return err instanceof Error
    ? { name: err.name, message: err.message, stack: err.stack }
    : { value: valueToString(err, { nullValue: 'null', undefinedValue: 'undefined' }) };
}

/**
 * Install the process-level fault guards. Idempotent: only the first call
 * registers listeners; later calls are no-ops (so the first caller's options
 * win for the lifetime of the process).
 *
 * @param options - Behaviour options (see {@link GOProcessGuardsOptions})
 */
export function installProcessGuards(options?: GOProcessGuardsOptions): void {
  if (installed) {
    return;
  }
  installed = true;

  const exitOnFatal = options?.exitOnFatal ?? true;

  process.on('unhandledRejection', (reason) => {
    console.error(
      JSON.stringify({
        level: 'fatal',
        type: 'unhandledRejection',
        requestId: currentRequestId,
        reason: serializeError(reason),
      }),
    );
    if (exitOnFatal) {
      process.exit(1);
    }
  });

  process.on('uncaughtException', (error, origin) => {
    console.error(
      JSON.stringify({
        level: 'fatal',
        type: 'uncaughtException',
        requestId: currentRequestId,
        origin,
        error: serializeError(error),
      }),
    );
    if (exitOnFatal) {
      process.exit(1);
    }
  });

  process.on('warning', (warning) => {
    console.warn(
      JSON.stringify({
        level: 'warn',
        type: 'processWarning',
        name: warning.name,
        message: warning.message,
        stack: warning.stack,
      }),
    );
  });

  if (options?.includeBeforeExit) {
    process.on('beforeExit', (code) => {
      console.warn(
        JSON.stringify({
          level: 'warn',
          type: 'beforeExit',
          code,
          requestId: currentRequestId,
        }),
      );
    });
  }
}

/**
 * Reset the module-global guard state. Intended for unit tests only, so each
 * test can exercise installation from a clean slate.
 */
export function resetProcessGuardsForTesting(): void {
  installed = false;
  currentRequestId = null;
}
