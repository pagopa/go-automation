import type { Runbook } from '../types/Runbook.js';
import type { RunbookExecutionResult } from '../types/RunbookExecutionResult.js';
import type { KnownCaseAnalysis } from '../types/KnownCaseAnalysis.js';
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

  const analyses = annotated.map((knownCase) => knownCase.analysis).filter(isDefined);

  return buildKnownCaseDraft(
    runbook,
    primary.analysis,
    analyses,
    interpolateResolution(primary.analysis.resolution, result),
  );
}

/**
 * Builds every potential draft shape needed by static budget validation.
 *
 * Each annotated case is considered as the primary scalar source. Its
 * references are merged with every following case in the same stable,
 * priority-descending order used by the engine: higher-priority cases cannot
 * coexist with a lower primary because they would become primary themselves.
 * The declared resolution template is kept verbatim because its runtime
 * placeholder values are not available during registry validation. Runtime
 * transport bounds remain authoritative after interpolation.
 *
 * @param runbook - Runbook definition being validated
 * @returns Real draft envelopes representing the statically knowable worst cases
 */
export function buildPotentialAnalysisDrafts(runbook: Runbook): ReadonlyArray<AnalysisDraftV1> {
  const unknown = runbook.metadata.type === 'alarm-resolution' ? buildUnknownContext(runbook) : undefined;
  const analyses = [...runbook.knownCases]
    .sort((left, right) => right.priority - left.priority)
    .map((knownCase) => knownCase.analysis)
    .filter(isDefined);
  if (analyses.length === 0) return unknown === undefined ? [] : [unknown];

  const known = analyses.map((primary, primaryIndex) =>
    buildKnownCaseDraft(runbook, primary, analyses.slice(primaryIndex), primary.resolution),
  );
  return unknown === undefined ? known : [...known, unknown];
}

function buildKnownCaseDraft(
  runbook: Runbook,
  primary: KnownCaseAnalysis,
  analyses: ReadonlyArray<KnownCaseAnalysis>,
  conclusionNotes: string,
): KnownCaseAnalysisDraft {
  const defaults = runbook.analysisDefaults;
  return {
    schemaVersion: 1,
    kind: 'KNOWN_CASE',
    conclusionNotes,
    ...(primary.errorDetails === undefined ? {} : { errorDetails: primary.errorDetails }),
    proposedStatus: primary.proposedStatus,
    analysisType: primary.analysisType,
    ...(primary.ignoreReasonCode === undefined ? {} : { ignoreReasonCode: primary.ignoreReasonCode }),
    ...(primary.ignoreDetails === undefined ? {} : { ignoreDetails: primary.ignoreDetails }),
    ...(defaults?.runbookName === undefined ? {} : { runbookName: defaults.runbookName }),
    resources: dedupeResources([...(defaults?.resources ?? []), ...analyses.flatMap((a) => a.resources ?? [])]),
    downstreams: dedupeStrings([...(defaults?.downstreams ?? []), ...analyses.flatMap((a) => a.downstreams ?? [])]),
    finalActions: dedupeStrings([...(defaults?.finalActions ?? []), ...analyses.flatMap((a) => a.finalActions ?? [])]),
    links: dedupeLinks([...(defaults?.links ?? []), ...analyses.flatMap((a) => a.links ?? [])]),
  };
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
