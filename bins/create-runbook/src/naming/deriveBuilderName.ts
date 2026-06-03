import { toPascalCase } from './toPascalCase.js';

/**
 * Suggests a builder function name for a runbook id, following the
 * `build<Name>Runbook` convention used in go-analyze-alarm.
 *
 * The leading `pn-` (if present) is dropped and the rest is PascalCased.
 * The result is a best-effort suggestion: some ids map to a builder name
 * semantically (e.g. `IO_EXP` → `IoExp`), so callers should let the user
 * confirm or override it.
 *
 * @param runbookId - Runbook id / directory name (e.g. `pn-delivery-B2B-ApiGwAlarm`)
 * @returns Suggested builder name (e.g. `buildDeliveryB2BApiGwAlarmRunbook`)
 */
export function deriveBuilderName(runbookId: string): string {
  const withoutPnPrefix = runbookId.replace(/^pn-/, '');
  return `build${toPascalCase(withoutPnPrefix)}Runbook`;
}
