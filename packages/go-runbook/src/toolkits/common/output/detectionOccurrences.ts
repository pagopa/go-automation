import { omitUndefined } from '@pagopa/go-common/utils';

import type { IdentifierObservation } from '../../../engine/index.js';
import { canonicalTraceId } from '../parsing/traceIds/traceIdentity.js';
import type { KnownCaseDetectionOutput } from './KnownCaseDetectionOutput.js';
import type { DetectedCaseError } from './DetectedCaseError.js';
import type { CaseErrors } from './CaseErrors.js';
import { earliest, latest } from './isEarlier.js';
import { mergeObservations } from './tree/mergeObservations.js';

/**
 * The detections of an execution by case and occurrence: in an error tree one entry per case and request, not one per
 * node. The occurrence is told by the typed identifiers of the detection, a trace id in its canonical form (two raw
 * X-Ray headers of the same Root are one request), and a detection without identifiers joins the others of its case.
 * A detection of the window (a runbook without tree) stays an entry of its own: its identifiers may name several
 * requests.
 *
 * - `errors` counts the distinct errors of the occurrence; times are the earliest and the latest, the observations
 *   merged (the earliest of each identifier).
 * - The evidence rows are the most of a detection: every error of a request reads the rows of that request.
 * - `resolvedMessage` is the first message; `resolvedMessages` keeps every distinct one, in order, when there are more.
 *
 * Complexity: O(D) over the detections.
 *
 * @param detected - The detections of the errors, in time order
 * @returns The entries, in the order their first detection comes
 *
 * @example
 * ```typescript
 * detectionOccurrences(detected); // 10.716 detections of 4 cases on 157 requests → about 160 entries
 * ```
 */
export function detectionOccurrences(
  detected: ReadonlyArray<DetectedCaseError>,
): ReadonlyArray<KnownCaseDetectionOutput> {
  const groups = new Map<string, [DetectedCaseError, ...DetectedCaseError[]]>();
  for (const entry of detected) {
    const key = entry.inTree
      ? `${entry.output.caseId}\n${occurrenceKey(entry.output.observations)}`
      : `window\n${entry.errorKey}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [entry]);
    else group.push(entry);
  }
  return [...groups.values()].map(occurrenceOf);
}

/**
 * The number of distinct errors of each case, in the order the cases come.
 *
 * @param detected - The detections of the errors
 * @returns The description and the errors of each case
 */
export function errorsByCase(detected: ReadonlyArray<DetectedCaseError>): ReadonlyArray<CaseErrors> {
  const byCase = new Map<string, { description: string; keys: Set<string> }>();
  for (const { output, errorKey } of detected) {
    const entry = byCase.get(output.caseId) ?? { description: output.description, keys: new Set<string>() };
    entry.keys.add(errorKey);
    byCase.set(output.caseId, entry);
  }
  return [...byCase.values()].map(({ description, keys }) => ({ description, errors: keys.size }));
}

/** The request a detection belongs to: its typed identifiers, a trace id in canonical form. */
function occurrenceKey(observations: ReadonlyArray<IdentifierObservation>): string {
  const identifiers = new Set(
    observations.map(({ kind, value }) => `${kind}=${kind === 'traceId' ? (canonicalTraceId(value) ?? value) : value}`),
  );
  return [...identifiers].sort().join('\u0001');
}

function occurrenceOf(group: readonly [DetectedCaseError, ...DetectedCaseError[]]): KnownCaseDetectionOutput {
  const outputs = group.map(({ output }) => output);
  const head = group[0].output;
  const messages = [...new Set(outputs.flatMap(({ resolvedMessage }) => resolvedMessage ?? []))];
  return {
    caseId: head.caseId,
    description: head.description,
    ...omitUndefined({
      firstSeenAt: earliest(outputs.map(({ firstSeenAt }) => firstSeenAt)),
      lastSeenAt: latest(outputs.map(({ lastSeenAt }) => lastSeenAt)),
    }),
    errors: new Set(group.map(({ errorKey }) => errorKey)).size,
    evidenceRows: Math.max(...outputs.map(({ evidenceRows }) => evidenceRows)),
    ...omitUndefined({ resolvedMessage: messages[0] }),
    ...(messages.length > 1 ? { resolvedMessages: messages } : {}),
    observations: mergeObservations(outputs.flatMap(({ observations }) => observations)),
  };
}
