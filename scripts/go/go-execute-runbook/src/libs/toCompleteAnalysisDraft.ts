import { ANALYSIS_DRAFT_BOUNDS, type AnalysisDraftV1 } from '@go-automation/go-runbook';

import type { CompleteExecutionAnalysisDraft } from '@go-automation/go-watchtower-client';

interface DraftReference {
  readonly name: string;
  readonly role?: 'PRIMARY' | 'QUERIED' | 'CASE_RELATED';
  readonly type?: string;
}

interface DraftLink {
  readonly url: string;
  readonly name?: string;
  readonly type?: string;
}

/**
 * Adapts the runbook draft to the completion wire shape, clamping it to the
 * contract bounds (§5.1).
 *
 * Defence in depth, not the primary guard: `assertAnalysisAnnotations` already
 * rejects an out-of-bounds annotation at registration, and CI checks the 64 KiB
 * budget. This runs on data that should already be valid, so its job is to make
 * an invalid draft impossible to send rather than to repair a legitimate one.
 *
 * The two kinds of field are clamped differently on purpose:
 *
 * - free text (`conclusionNotes`, `errorDetails`) is **truncated** — losing the
 *   tail of a prose field costs a bit of context and nothing else;
 * - identifiers (names, urls) are **never** truncated: a shortened name is not
 *   a shorter name, it is a different one, and it would either resolve to the
 *   wrong entity or fail resolution with a misleading value. An over-bound
 *   identifier drops its whole entry, so the reference is simply not declared.
 *
 * The byte budget is deliberately **not** enforced here: Watchtower blocks an
 * oversize draft with `DRAFT_TOO_LARGE` and records `{sha256, byteLength}` in
 * the diagnostics, which is strictly better evidence than a silent worker-side
 * drop. Clamping cannot make a draft grow, so anything over budget here was
 * over budget at registration too — a bug worth seeing, not hiding.
 *
 * @param draft - Draft built from the runbook known-case annotations
 * @returns The wire draft, or `undefined` when the runbook produced none
 */
export function toCompleteAnalysisDraft(draft: AnalysisDraftV1 | undefined): CompleteExecutionAnalysisDraft {
  if (draft === undefined) return undefined;

  const shared = {
    schemaVersion: draft.schemaVersion,
    kind: draft.kind,
    ...(draft.runbookName === undefined ? {} : { runbookName: clampName(draft.runbookName) }),
    resources: clampArray(draft.resources).filter(isBoundedReference).map(toWireReference),
    downstreams: clampArray(draft.downstreams).filter(isBoundedName),
    finalActions: clampArray(draft.finalActions).filter(isBoundedName),
    links: clampArray(draft.links).filter(isBoundedLink).map(toWireLink),
  };

  if (draft.kind === 'UNKNOWN_CASE_CONTEXT') return shared;

  return {
    ...shared,
    proposedStatus: draft.proposedStatus,
    analysisType: draft.analysisType,
    conclusionNotes: truncate(draft.conclusionNotes, ANALYSIS_DRAFT_BOUNDS.TEXT_LENGTH),
    ...(draft.errorDetails === undefined
      ? {}
      : { errorDetails: truncate(draft.errorDetails, ANALYSIS_DRAFT_BOUNDS.TEXT_LENGTH) }),
    ...(draft.ignoreReasonCode === undefined
      ? {}
      : { ignoreReasonCode: draft.ignoreReasonCode.slice(0, ANALYSIS_DRAFT_BOUNDS.IGNORE_REASON_CODE_LENGTH) }),
    ...(draft.ignoreDetails === undefined ? {} : { ignoreDetails: draft.ignoreDetails }),
  };
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

function clampName(value: string): string {
  return value.slice(0, ANALYSIS_DRAFT_BOUNDS.NAME_LENGTH);
}

function clampArray<T>(values: ReadonlyArray<T>): ReadonlyArray<T> {
  return values.length <= ANALYSIS_DRAFT_BOUNDS.ARRAY_ITEMS
    ? values
    : values.slice(0, ANALYSIS_DRAFT_BOUNDS.ARRAY_ITEMS);
}

function isBoundedName(value: string): boolean {
  return value.length > 0 && value.length <= ANALYSIS_DRAFT_BOUNDS.NAME_LENGTH;
}

function isBoundedReference(reference: DraftReference): boolean {
  if (!isBoundedName(reference.name)) return false;
  return reference.type === undefined || isBoundedName(reference.type);
}

function isBoundedLink(link: DraftLink): boolean {
  if (link.url.length === 0 || link.url.length > ANALYSIS_DRAFT_BOUNDS.URL_LENGTH) return false;
  if (link.name !== undefined && !isBoundedName(link.name)) return false;
  return link.type === undefined || link.type.length <= ANALYSIS_DRAFT_BOUNDS.LINK_TYPE_LENGTH;
}

function toWireReference(reference: DraftReference): DraftReference {
  return {
    name: reference.name,
    ...(reference.role === undefined ? {} : { role: reference.role }),
    ...(reference.type === undefined ? {} : { type: reference.type }),
  };
}

function toWireLink(link: DraftLink): DraftLink {
  return {
    url: link.url,
    ...(link.name === undefined ? {} : { name: link.name }),
    ...(link.type === undefined ? {} : { type: link.type }),
  };
}
