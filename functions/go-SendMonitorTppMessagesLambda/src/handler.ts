/**
 * Lambda handler for SEND Monitor TPP Messages
 *
 * Wraps the existing CLI script logic in a Lambda-compatible handler using
 * GOScript.createLambdaHandler(). The handler:
 * 1. Receives a ScheduledEvent (or custom event with config overrides)
 * 2. Executes the same main() business logic as the CLI script
 * 3. Uploads generated CSV reports to S3 (if REPORTS_S3_BUCKET is set)
 *
 * Configuration:
 * - All script parameters can be passed via env vars (GOEnvironmentConfigProvider)
 *   or via the event payload (GOLambdaEventConfigProvider)
 * - SLACK_TOKEN env var → mapped to slack.token (sensitive: true redacts in logs)
 * - REPORTS_S3_BUCKET env var → S3 bucket for CSV upload
 * - REPORTS_S3_PREFIX env var → S3 key prefix (default: "reports/tpp-monitor")
 * - AWS credentials come from the execution role (no SSO profile needed)
 */

import type { Context, ScheduledEvent } from 'aws-lambda';

import { S3Client } from '@aws-sdk/client-s3';
import { Core, AWS } from '@go-automation/go-common';
import { scriptMetadata, scriptParameters } from 'send-monitor-tpp-messages/config';
import { main } from 'send-monitor-tpp-messages/main';

// ============================================================================
// Global process-level error handlers
// ----------------------------------------------------------------------------
// Registered once at module load (cold start). Ensure unhandled rejections and
// uncaught exceptions are logged with a stack trace BEFORE the runtime marks the
// invocation as Runtime.ExitError with "exited without providing a reason".
// ============================================================================

const stringifyNonError = (err: unknown): string => {
  if (typeof err === 'string') return err;
  if (typeof err === 'number' || typeof err === 'boolean' || err === null || err === undefined) {
    return `${err}`;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return Object.prototype.toString.call(err);
  }
};

const serializeError = (err: unknown): Record<string, unknown> =>
  err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : { value: stringifyNonError(err) };

// Tracks the in-flight invocation's awsRequestId so process-level handlers can
// attribute fatal logs to the right request. AWS_LAMBDA_REQUEST_ID is not a
// standard env var — the id only lives on the Context object. Set at handler
// entry, cleared in finally so warm-container background faults (which are not
// tied to any invocation) log null instead of a stale id.
let currentRequestId: string | null = null;

process.on('unhandledRejection', (reason) => {
  console.error(
    JSON.stringify({
      level: 'fatal',
      type: 'unhandledRejection',
      requestId: currentRequestId,
      reason: serializeError(reason),
    }),
  );
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

process.on('beforeExit', (code) => {
  // Fires when the event loop is about to drain. If this logs mid-invocation,
  // something is leaking handles or keeping the loop alive unexpectedly.
  console.warn(
    JSON.stringify({
      level: 'warn',
      type: 'beforeExit',
      code,
      requestId: currentRequestId,
    }),
  );
});

// ============================================================================
// Module-scope singletons (reused across warm invocations)
// ============================================================================

/**
 * GOScript instance configured with the same metadata and parameters as the CLI script.
 * Instantiated at module scope for Lambda container reuse.
 */
const script = new Core.GOScript({
  metadata: scriptMetadata,
  config: {
    parameters: scriptParameters,
  },
});

/**
 * Lazily-initialised S3 service, cached at module scope so its connection pool
 * is reused across warm invocations.
 *
 * - Created on the first invocation that actually needs it (i.e. the first
 *   invocation where REPORTS_S3_BUCKET is truthy), not at cold start.
 * - Never rebuilt for the lifetime of the container. Lambda env vars are fixed
 *   per-container, and S3Client is not bound to a bucket (the bucket is passed
 *   per request), so there is no staleness concern if REPORTS_S3_BUCKET changes
 *   between deployments.
 */
let s3Service: AWS.AWSS3Service | undefined;
const getS3Service = (): AWS.AWSS3Service => {
  s3Service ??= new AWS.AWSS3Service(new S3Client({}));
  return s3Service;
};

// ============================================================================
// Diagnostics helpers
// ============================================================================

type GetActiveHandlesFn = () => unknown[];
type GetActiveRequestsFn = () => unknown[];

interface ProcessHandles {
  readonly _getActiveHandles?: GetActiveHandlesFn;
  readonly _getActiveRequests?: GetActiveRequestsFn;
}

/**
 * Opt-in diagnostic snapshots on the happy path. Each call writes one JSON line
 * to CloudWatch, so on a 3-phase invocation (start / after-main / end) this is
 * three log entries per run — material cost at scale. Enable per-environment by
 * setting DEBUG_RESOURCE_SNAPSHOTS=1 (or true). Error-path snapshots ignore
 * this gate and always emit (see `force` below).
 */
const isResourceSnapshotEnabled = (): boolean => {
  const value = process.env['DEBUG_RESOURCE_SNAPSHOTS'];
  return value === '1' || value === 'true';
};

const logResourceSnapshot = (phase: string, options?: { readonly force?: boolean }): void => {
  if (!options?.force && !isResourceSnapshotEnabled()) {
    return;
  }
  const mem = process.memoryUsage();
  const handles = process as unknown as ProcessHandles;
  console.log(
    JSON.stringify({
      level: 'info',
      type: 'resourceSnapshot',
      phase,
      requestId: currentRequestId,
      rssMB: Math.round(mem.rss / 1024 / 1024),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      externalMB: Math.round(mem.external / 1024 / 1024),
      activeHandles: handles._getActiveHandles?.().length ?? -1,
      activeRequests: handles._getActiveRequests?.().length ?? -1,
    }),
  );
};

// ============================================================================
// Handler
// ============================================================================

/**
 * Lambda handler exported for AWS Lambda runtime.
 *
 * Supports two invocation patterns:
 * - **ScheduledEvent**: EventBridge rule triggers on a cron schedule
 * - **Custom event**: Direct invocation with config overrides in the payload
 *
 * The GOLambdaEventConfigProvider automatically maps event payload keys
 * to configuration parameters (e.g., `startDate` → `start.date`).
 *
 * @example EventBridge scheduled rule (no payload overrides needed)
 * ```json
 * { "source": "aws.events", "detail-type": "Scheduled Event" }
 * ```
 *
 * @example Custom invocation with config overrides
 * ```json
 * { "from": "2024-01-01", "to": "2024-01-31", "athenaDatabase": "my_db" }
 * ```
 */
export const handler = script.createLambdaHandler<ScheduledEvent, void, Context>(async (_event, context) => {
  // Detach early from the event loop: the Lambda runtime freezes the container at
  // handler return, so pending keep-alive sockets / timers from previous invocations
  // must not block the response. Our cleanup preserves AWS clients by design.
  if (context) {
    context.callbackWaitsForEmptyEventLoop = false;
  }

  currentRequestId = context?.awsRequestId ?? null;

  logResourceSnapshot('start');

  try {
    // Execute the main business logic (same as CLI script).
    // Config resolution is handled by GOScript lifecycle:
    // - env vars → GOEnvironmentConfigProvider (SLACK_TOKEN → slack.token, etc.)
    // - event payload → GOLambdaEventConfigProvider (camelCase → dot.notation)
    // - defaults from scriptParameters
    await main(script);

    logResourceSnapshot('after-main');

    // Post-execution: upload CSV reports to S3 if configured
    const reportsBucket = process.env['REPORTS_S3_BUCKET'];
    if (reportsBucket) {
      const prefix = process.env['REPORTS_S3_PREFIX'] ?? 'reports/tpp-monitor';
      const reportsDir = script.paths.resolvePath('reports', Core.GOPathType.OUTPUT) ?? '/tmp/reports';

      const uploaded = await getS3Service().uploadDirectory(reportsDir, reportsBucket, prefix);

      for (const key of uploaded) {
        script.logger.info(`Uploaded: s3://${reportsBucket}/${key}`);
      }
    }

    logResourceSnapshot('end');
  } catch (error) {
    logResourceSnapshot('error', { force: true });
    throw error;
  } finally {
    // Clear so any background fault that fires between invocations logs null
    // instead of misattributing to the previous request.
    currentRequestId = null;
  }
});
