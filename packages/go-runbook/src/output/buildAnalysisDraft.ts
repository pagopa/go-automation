import type { Runbook } from '../types/Runbook.js';
import type { RunbookExecutionResult } from '../types/RunbookExecutionResult.js';
import type { AnalysisLinkRef } from '../types/AnalysisLinkRef.js';
import type { AnalysisResourceRef } from '../types/AnalysisResourceRef.js';
import type { AnalysisDraftV1 } from './AnalysisDraft.js';
import type { KnownCaseAnalysisDraft } from './KnownCaseAnalysisDraft.js';
import type { UnknownCaseContextDraft } from './UnknownCaseContextDraft.js';
import { interpolatePlaceholders } from '../core/templatePlaceholders.js';

/** Placeholder rendered when a `resolution` interpolates a value the run never produced. */
const UNAVAILABLE_VALUE = 'non disponibile';

/**
 * Composes the deterministic analysis draft for a completed run.
 *
 * Known cases produce a `KNOWN_CASE` draft merging the runbook defaults with the
 * matched cases; a run with no match produces the `UNKNOWN_CASE_CONTEXT` draft of
 * the defaults alone. Any other outcome produces no draft at all.
 *
 * Merge rules: lists are unioned and de-duplicated preserving declaration order,
 * scalars come from the primary case. Complexity: O(N) over matched cases.
 *
 * @param runbook - The executed runbook definition
 * @param result - The execution result, source of the matched cases and placeholders
 * @returns The draft, or `undefined` when the outcome carries no analysis
 *
 * @example
 * ```typescript
 * const draft = buildAnalysisDraft(runbook, result);
 * if (draft?.kind === 'KNOWN_CASE') console.log(draft.proposedStatus);
 * ```
 */
export function buildAnalysisDraft(runbook: Runbook, result: RunbookExecutionResult): AnalysisDraftV1 | undefined {
  if (result.status === 'aborted' || result.status === 'failed') return undefined;

  const annotated = result.matchedCases.filter((knownCase) => knownCase.analysis !== undefined);
  const primary = annotated[0];
  if (primary?.analysis === undefined) {
    return runbook.metadata.type === 'alarm-resolution' && result.matchedCases.length === 0
      ? buildUnknownContext(runbook)
      : undefined;
  }

  const defaults = runbook.analysisDefaults;
  const analyses = annotated.map((knownCase) => knownCase.analysis).filter(isDefined);

  return {
    schemaVersion: 1,
    kind: 'KNOWN_CASE',
    conclusionNotes: interpolateResolution(primary.analysis.resolution, result),
    ...(primary.analysis.errorDetails === undefined ? {} : { errorDetails: primary.analysis.errorDetails }),
    proposedStatus: primary.analysis.proposedStatus,
    analysisType: primary.analysis.analysisType,
    ...(primary.analysis.ignoreReasonCode === undefined ? {} : { ignoreReasonCode: primary.analysis.ignoreReasonCode }),
    ...(primary.analysis.ignoreDetails === undefined ? {} : { ignoreDetails: primary.analysis.ignoreDetails }),
    ...(defaults?.runbookName === undefined ? {} : { runbookName: defaults.runbookName }),
    resources: dedupeResources([...(defaults?.resources ?? []), ...analyses.flatMap((a) => a.resources ?? [])]),
    downstreams: dedupeStrings([...(defaults?.downstreams ?? []), ...analyses.flatMap((a) => a.downstreams ?? [])]),
    finalActions: dedupeStrings([...(defaults?.finalActions ?? []), ...analyses.flatMap((a) => a.finalActions ?? [])]),
    links: dedupeLinks([...(defaults?.links ?? []), ...analyses.flatMap((a) => a.links ?? [])]),
  } satisfies KnownCaseAnalysisDraft;
}

function buildUnknownContext(runbook: Runbook): UnknownCaseContextDraft | undefined {
  const defaults = runbook.analysisDefaults;
  if (defaults === undefined) return undefined;
  return {
    schemaVersion: 1,
    kind: 'UNKNOWN_CASE_CONTEXT',
    ...(defaults.runbookName === undefined ? {} : { runbookName: defaults.runbookName }),
    resources: dedupeResources(defaults.resources ?? []),
    downstreams: dedupeStrings(defaults.downstreams ?? []),
    finalActions: dedupeStrings(defaults.finalActions ?? []),
    links: dedupeLinks(defaults.links ?? []),
  };
}

function interpolateResolution(resolution: string, result: RunbookExecutionResult): string {
  return interpolatePlaceholders(
    resolution,
    { vars: result.finalContext.vars, params: result.finalContext.params },
    { missingValue: UNAVAILABLE_VALUE },
  );
}

/** De-duplicates by name, keeping the first declaration (defaults win over cases). */
function dedupeResources(refs: ReadonlyArray<AnalysisResourceRef>): ReadonlyArray<AnalysisResourceRef> {
  const seen = new Map<string, AnalysisResourceRef>();
  for (const ref of refs) {
    if (!seen.has(ref.name)) seen.set(ref.name, ref);
  }
  return [...seen.values()];
}

/** De-duplicates by URL, keeping the first declaration. */
function dedupeLinks(links: ReadonlyArray<AnalysisLinkRef>): ReadonlyArray<AnalysisLinkRef> {
  const seen = new Map<string, AnalysisLinkRef>();
  for (const link of links) {
    if (!seen.has(link.url)) seen.set(link.url, link);
  }
  return [...seen.values()];
}

function dedupeStrings(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...new Set(values)];
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
