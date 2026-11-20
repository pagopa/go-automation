import type { Runbook } from '../../../../engine/types/Runbook.js';
import type { RunbookExecutionResult } from '../../../../engine/types/RunbookExecutionResult.js';
import type { KnownCaseDetection } from '../../../../engine/types/KnownCaseDetection.js';
import type { KnownCaseAnalysis } from '../KnownCaseAnalysis.js';
import type { AnalysisLinkRef } from '../AnalysisLinkRef.js';
import type { AnalysisResourceRef } from '../AnalysisResourceRef.js';
import type { AnalysisDraftV1 } from './AnalysisDraft.js';
import type { KnownCaseAnalysisDraft } from './KnownCaseAnalysisDraft.js';
import type { UnknownCaseContextDraft } from './UnknownCaseContextDraft.js';
import { interpolatePlaceholders } from '../../../../engine/context/templatePlaceholders.js';
import { fitAnalysisDraft } from './fitAnalysisDraft.js';
import { buildCoverageLines } from '../../output/buildCoverageLines.js';
import { detectionContext } from '../../output/resultContexts.js';
import { buildErrorChains } from '../../output/buildErrorChains.js';
import { renderErrorChainLines } from '../../output/renderErrorChainLines.js';

/** Placeholder rendered when a `resolution` interpolates a value the run never produced. */
const UNAVAILABLE_VALUE = 'non disponibile';

/** An annotated detection with the texts it contributes to the draft. */
interface DraftEntry {
  readonly detection: KnownCaseDetection;
  readonly analysis: KnownCaseAnalysis;
  readonly resolution: string;
}

/**
 * Composes the deterministic analysis draft for a completed run.
 *
 * Detections with analysis directives produce a `KNOWN_CASE` draft; a run with no detection produces the
 * `UNKNOWN_CASE_CONTEXT` draft of the defaults alone. Any other outcome produces no draft at all.
 *
 * - One detection and nothing to report about coverage: the draft of a single case, as before.
 * - Otherwise `conclusionNotes` lists the detections in time order, one numbered entry each, followed by the coverage
 *   lines; `errorDetails` joins the details of the cases in the same order.
 * - `proposedStatus` is `COMPLETED` when at least one detection is a closable case: every window-level chain is a true
 *   leaf.
 * - `analysisType` is `IGNORABLE` only when every detection is ignorable with the same reason and details.
 * - Lists: the defaults, then the cases in time order, without duplicates.
 *
 * The draft is fitted to the bounds of the analysis contract before it is returned. Complexity: O(D) over the
 * detections.
 *
 * @param runbook - The executed runbook definition
 * @param result - The execution result, source of the detections and of the placeholders
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

  const entries: DraftEntry[] = [];
  for (const detection of draftDetections(result)) {
    const analysis = detection.knownCase.analysis;
    if (analysis === undefined) continue;
    entries.push({ detection, analysis, resolution: interpolateResolution(analysis.resolution, result, detection) });
  }

  if (entries.length === 0) {
    return runbook.metadata.type === 'alarm-resolution' && result.detections.length === 0
      ? buildUnknownContext(runbook)
      : undefined;
  }

  const coverageLines = buildCoverageLines(result);
  const chainNotes = treeNoteEntries(result, entries);
  const draft = buildKnownCaseDraft(runbook, entries, coverageLines, chainVerdict(result), chainNotes);
  const single = entries.length === 1 && coverageLines.length === 0 && chainNotes === undefined;
  return fitAnalysisDraft(
    draft,
    single
      ? undefined
      : { noteEntries: chainNotes ?? noteEntries(entries), coverageLines, detailEntries: detailEntries(entries) },
  );
}

/**
 * Builds every potential draft shape needed by static budget validation.
 *
 * Each annotated case is considered alone, with its declared resolution, and all annotated cases together, which is
 * the worst case of the lists, with its composed texts fitted as at runtime. The declared resolution templates are
 * kept verbatim because their runtime placeholder values are not available during registry validation.
 *
 * @param runbook - Runbook definition being validated
 * @returns Real draft envelopes representing the statically knowable worst cases
 */
export function buildPotentialAnalysisDrafts(runbook: Runbook): ReadonlyArray<AnalysisDraftV1> {
  const unknown = runbook.metadata.type === 'alarm-resolution' ? buildUnknownContext(runbook) : undefined;
  const entries = runbook.knownCases.flatMap((knownCase): DraftEntry[] =>
    knownCase.analysis === undefined
      ? []
      : [
          {
            detection: { knownCase, evidenceRows: 0, observations: [] },
            analysis: knownCase.analysis,
            resolution: knownCase.analysis.resolution,
          },
        ],
  );
  if (entries.length === 0) return unknown === undefined ? [] : [unknown];

  const known = entries.map((entry) => buildKnownCaseDraft(runbook, [entry], []));
  // All cases together are the worst case of the lists; their composed texts are fitted as at runtime.
  const together =
    entries.length > 1
      ? [
          fitAnalysisDraft(buildKnownCaseDraft(runbook, entries, []), {
            noteEntries: noteEntries(entries),
            coverageLines: [],
            detailEntries: detailEntries(entries),
          }),
        ]
      : [];
  return unknown === undefined ? [...known, ...together] : [...known, ...together, unknown];
}

function buildKnownCaseDraft(
  runbook: Runbook,
  entries: ReadonlyArray<DraftEntry>,
  coverageLines: ReadonlyArray<string>,
  verdict?: ChainVerdict,
  chainNotes?: ReadonlyArray<string>,
): KnownCaseAnalysisDraft {
  const defaults = runbook.analysisDefaults;
  const analyses = entries.map((entry) => entry.analysis);
  const single =
    entries.length === 1 && coverageLines.length === 0 && chainNotes === undefined ? entries[0] : undefined;
  const ignorable =
    verdict === undefined
      ? commonIgnore(analyses)
      : verdict.endAnalyses === undefined
        ? undefined
        : commonIgnore(verdict.endAnalyses);
  const completed =
    verdict === undefined ? analyses.some((analysis) => analysis.proposedStatus === 'COMPLETED') : verdict.completed;
  const errorDetails = single?.analysis.errorDetails ?? joinErrorDetails(entries);

  return {
    schemaVersion: 1,
    kind: 'KNOWN_CASE',
    conclusionNotes:
      single?.resolution ??
      (chainNotes === undefined ? joinNotes(entries, coverageLines) : [...chainNotes, ...coverageLines].join('\n')),
    ...(errorDetails === undefined ? {} : { errorDetails }),
    proposedStatus: completed ? 'COMPLETED' : 'IN_PROGRESS',
    analysisType: ignorable === undefined ? 'ANALYZABLE' : 'IGNORABLE',
    ...(ignorable?.ignoreReasonCode === undefined ? {} : { ignoreReasonCode: ignorable.ignoreReasonCode }),
    ...(ignorable?.ignoreDetails === undefined ? {} : { ignoreDetails: ignorable.ignoreDetails }),
    ...(defaults?.runbookName === undefined ? {} : { runbookName: defaults.runbookName }),
    resources: dedupeResources([...(defaults?.resources ?? []), ...analyses.flatMap((a) => a.resources ?? [])]),
    downstreams: dedupeStrings([...(defaults?.downstreams ?? []), ...analyses.flatMap((a) => a.downstreams ?? [])]),
    finalActions: dedupeStrings([...(defaults?.finalActions ?? []), ...analyses.flatMap((a) => a.finalActions ?? [])]),
    links: dedupeLinks([...(defaults?.links ?? []), ...analyses.flatMap((a) => a.links ?? [])]),
  };
}

/**
 * The common ignore directive of the cases, when every case is ignorable with the same reason and details.
 *
 * @returns The common directive, or `undefined` when the analysis is analyzable
 */
function commonIgnore(
  analyses: ReadonlyArray<KnownCaseAnalysis>,
): Pick<KnownCaseAnalysis, 'ignoreReasonCode' | 'ignoreDetails'> | undefined {
  const [first, ...rest] = analyses;
  if (first?.analysisType !== 'IGNORABLE') return undefined;
  const details = JSON.stringify(first.ignoreDetails ?? null);
  const same = rest.every(
    (analysis) =>
      analysis.analysisType === 'IGNORABLE' &&
      analysis.ignoreReasonCode === first.ignoreReasonCode &&
      JSON.stringify(analysis.ignoreDetails ?? null) === details,
  );
  return same ? first : undefined;
}

function noteEntries(entries: ReadonlyArray<DraftEntry>): ReadonlyArray<string> {
  return entries.map(
    (entry, index) =>
      `${String(index + 1)}. ${timePrefix(entry.detection)}${entry.detection.knownCase.description}: ${entry.resolution}`,
  );
}

function detailEntries(entries: ReadonlyArray<DraftEntry>): ReadonlyArray<string> {
  return entries.flatMap((entry, index) =>
    entry.analysis.errorDetails === undefined ? [] : [`${String(index + 1)}. ${entry.analysis.errorDetails}`],
  );
}

function joinNotes(entries: ReadonlyArray<DraftEntry>, coverageLines: ReadonlyArray<string>): string {
  return [...noteEntries(entries), ...coverageLines].join('\n');
}

function joinErrorDetails(entries: ReadonlyArray<DraftEntry>): string | undefined {
  const details = detailEntries(entries);
  return details.length === 0 ? undefined : details.join('\n');
}

/** `2026-11-19 10:15:42 UTC — ` for a timed detection, nothing for an untimed one. */
function timePrefix(detection: KnownCaseDetection): string {
  if (detection.firstSeenAt === undefined) return '';
  return `${detection.firstSeenAt.slice(0, 19).replace('T', ' ')} UTC — `;
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

function interpolateResolution(
  resolution: string,
  result: RunbookExecutionResult,
  detection: KnownCaseDetection,
): string {
  const context = detectionContext(result, detection);
  return interpolatePlaceholders(
    resolution,
    { vars: context.vars, params: context.params },
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

/** What the chains of an error tree say about closing and ignoring the occurrence. */
interface ChainVerdict {
  /** A chain ends in a true leaf recognized by a case that proposes `COMPLETED`. */
  readonly completed: boolean;
  /** The analyses of the cases every chain ends in; absent when a chain ends unrecognized or interrupted. */
  readonly endAnalyses?: ReadonlyArray<KnownCaseAnalysis>;
}

/**
 * The verdict of the chains of an error tree: closable when a chain ends in a recognized true leaf whose case
 * proposes `COMPLETED`, ignorable only when every chain ends in recognized ignorable cases.
 *
 * @param result - Result of the execution
 * @returns The verdict, or nothing for a window-level runbook
 */
function chainVerdict(result: RunbookExecutionResult): ChainVerdict | undefined {
  if (result.tree === undefined || result.chains === undefined) return undefined;
  const nodes = new Map(result.tree.map((node) => [node.id, node]));
  let completed = false;
  let endAnalyses: KnownCaseAnalysis[] | undefined = [];
  for (const group of result.chains) {
    for (const member of group.members) {
      const last = nodes.get(member.nodeIds[member.nodeIds.length - 1] ?? '');
      const detections = last?.detections ?? [];
      if (
        member.end === 'leaf' &&
        detections.some((detection) => detection.knownCase.analysis?.proposedStatus === 'COMPLETED')
      ) {
        completed = true;
      }
      const analyses = detections.flatMap((detection) =>
        detection.knownCase.analysis === undefined ? [] : [detection.knownCase.analysis],
      );
      if (member.end !== 'leaf' || analyses.length === 0 || analyses.length < detections.length)
        endAnalyses = undefined;
      else endAnalyses?.push(...analyses);
    }
  }
  return { completed, ...(endAnalyses !== undefined ? { endAnalyses } : {}) };
}

/**
 * The detections the draft lists: in an error tree, the cases of each group of chains, in the order of the groups,
 * from its oldest member, each case once per group; otherwise every detection.
 *
 * @param result - Result of the execution
 * @returns The detections, in order
 */
function draftDetections(result: RunbookExecutionResult): ReadonlyArray<KnownCaseDetection> {
  if (result.tree === undefined || result.chains === undefined) return result.detections;
  const nodes = new Map(result.tree.map((node) => [node.id, node]));
  return result.chains.flatMap((group) => {
    const seen = new Set<string>();
    return (group.members[0]?.nodeIds ?? []).flatMap((id) =>
      (nodes.get(id)?.detections ?? []).filter((detection) => {
        if (seen.has(detection.knownCase.id)) return false;
        seen.add(detection.knownCase.id);
        return true;
      }),
    );
  });
}

/**
 * The notes of an error tree: one entry per group of chains, in time order, with the chain and the resolutions of its
 * cases from the leaf up, each once. One group with one recognized case keeps the historical shape (nothing).
 *
 * @param result - Result of the execution
 * @param entries - Cases of the draft
 * @returns The entries, or nothing for a window-level runbook or a single recognized node
 */
function treeNoteEntries(
  result: RunbookExecutionResult,
  entries: ReadonlyArray<DraftEntry>,
): ReadonlyArray<string> | undefined {
  const chains = result.chains;
  if (result.tree === undefined || chains === undefined) return undefined;
  // One complete chain with one recognized node keeps the historical shape of the draft.
  const only =
    chains.length === 1 &&
    buildCoverageLines(result).length === 0 &&
    chains[0]?.members.every((member) => member.end === 'leaf' && !member.incompleteEvidence) === true;
  const recognizedNodes = (chains[0]?.members[0]?.nodeIds ?? []).filter((id) =>
    result.tree?.some((node) => node.id === id && node.detections.length > 0),
  );
  if (only && entries.length === 1 && recognizedNodes.length === 1) return undefined;
  const nodeOf = new Map(
    result.tree.flatMap((node) => node.detections.map((detection) => [detection, node.id] as const)),
  );
  const lines = renderErrorChainLines(buildErrorChains(result));
  return chains.map((group, index) => {
    const path = group.members[0]?.nodeIds ?? [];
    const resolutions = [
      ...new Set(
        [...path]
          .reverse()
          .flatMap((nodeId) =>
            entries.filter((entry) => nodeOf.get(entry.detection) === nodeId).map((entry) => entry.resolution),
          ),
      ),
    ];
    const chain = lines[index] ?? '';
    return `${String(index + 1)}. ${chain}${resolutions.length > 0 ? ` — ${resolutions.join('; ')}` : ''}`;
  });
}
