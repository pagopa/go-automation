/**
 * Helpers to evaluate the conditions of INTEROP known errors against
 * hand-built step evidence, without executing the pipeline.
 */
import type { OperationalContext } from '../../../../../toolkits/common/services/OperationalContext.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import type { LogRows } from '../../../../../__tests__/helpers/LogRows.js';

/**
 * Application-log rows of one pod, one row per message.
 *
 * @param podApp - Pod that emitted the rows
 * @param messages - `@message` of each row
 * @returns The rows, in the shape of the INTEROP query steps
 *
 * @example
 * ```typescript
 * const rows = podLogRows('interop-be-notifier', ['ERROR - boom']);
 * ```
 */
export function podLogRows(podApp: string, messages: ReadonlyArray<string>): LogRows {
  return messages.map((message) => [
    { field: 'pod_app', value: podApp },
    { field: '@message', value: message },
  ]);
}

/**
 * Output of the CID tracker step for a single CID.
 *
 * @param rows - Rows traced for the CID
 * @param cid - The traced CID
 * @returns The tracker output
 *
 * @example
 * ```typescript
 * const tracker = cidTrackerOutput(podLogRows('interop-be-catalog', ['ERROR - boom']));
 * ```
 */
export function cidTrackerOutput(
  rows: LogRows,
  cid = 'cid-1',
): ReadonlyArray<{ readonly cid: string; readonly rows: LogRows }> {
  return [{ cid, rows }];
}

/**
 * Context holding the given step outputs and the resolved INTEROP environment.
 *
 * @param stepResults - Output of each step, by step id
 * @param environment - Value of `interopEnvironment`
 * @returns A context built by `createTestContext`
 *
 * @example
 * ```typescript
 * const context = conditionContext([[alarm.stepIds.queryApplicationLogs, rows]], 'att');
 * ```
 */
export function conditionContext(
  stepResults: ReadonlyArray<readonly [string, unknown]>,
  environment = 'prod',
): OperationalContext {
  return createTestContext({ stepResults: Object.fromEntries(stepResults), vars: { interopEnvironment: environment } });
}
