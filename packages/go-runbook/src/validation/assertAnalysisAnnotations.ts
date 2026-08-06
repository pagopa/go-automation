import type { KnownCaseAnalysis } from '../types/KnownCaseAnalysis.js';
import type { Runbook } from '../types/Runbook.js';
import type { RunbookProduct } from '../types/RunbookProduct.js';
import { INTEROP_DOWNSTREAMS } from '../analysis/downstreams/INTEROP_DOWNSTREAMS.js';
import { SEND_DOWNSTREAMS } from '../analysis/downstreams/SEND_DOWNSTREAMS.js';

/** Watchtower registry names are bounded to 255 characters. */
const MAX_NAME_LENGTH = 255;
/** `conclusionNotes`/`errorDetails` bound of the Watchtower analysis contract. */
const MAX_TEXT_LENGTH = 5_000;
const MAX_URL_LENGTH = 2_000;
const MAX_LINK_TYPE_LENGTH = 50;
const MAX_IGNORE_REASON_CODE_LENGTH = 100;
/** Raw budget of the serialized draft enforced by Watchtower (§5.4). */
const MAX_DRAFT_BYTES = 64 * 1_024;

const DOWNSTREAM_CATALOGS: Readonly<Record<RunbookProduct, ReadonlySet<string>>> = {
  SEND: new Set<string>(Object.values(SEND_DOWNSTREAMS)),
  INTEROP: new Set<string>(Object.values(INTEROP_DOWNSTREAMS)),
};

/**
 * Rejects a runbook whose analysis annotations would produce an invalid or
 * unresolvable draft, so a configuration error fails in CI instead of blocking
 * the apply in production.
 *
 * Every known case of a registered runbook must carry `analysis`: without it the
 * apply would find no draft and block.
 *
 * @param runbook - The built runbook definition
 * @param product - Product declared on the registry entry, selecting the catalog
 * @throws Error on the first violation, naming runbook, case and field
 */
export function assertAnalysisAnnotations(runbook: Runbook, product: RunbookProduct): void {
  const runbookId = runbook.metadata.id;
  const catalog = DOWNSTREAM_CATALOGS[product];

  for (const name of runbook.analysisDefaults?.downstreams ?? []) {
    assertInCatalog(runbookId, undefined, name, catalog, product);
  }
  assertBoundedNames(runbookId, undefined, runbook.analysisDefaults?.finalActions ?? [], 'finalActions');
  for (const resource of runbook.analysisDefaults?.resources ?? []) {
    assertBoundedNames(runbookId, undefined, [resource.name], 'resources');
  }
  assertLinks(runbookId, undefined, runbook.analysisDefaults?.links ?? []);

  for (const knownCase of runbook.knownCases) {
    const analysis = knownCase.analysis;
    if (analysis === undefined) {
      throw new Error(`Runbook "${runbookId}": known case "${knownCase.id}" is missing the analysis annotation`);
    }
    assertKnownCaseAnalysis(runbookId, knownCase.id, analysis, catalog, product);
  }

  assertDraftBudget(runbookId, runbook);
}

function assertKnownCaseAnalysis(
  runbookId: string,
  caseId: string,
  analysis: KnownCaseAnalysis,
  catalog: ReadonlySet<string>,
  product: RunbookProduct,
): void {
  if (analysis.resolution.trim() === '') {
    throw new Error(`Runbook "${runbookId}": known case "${caseId}" declares an empty resolution`);
  }
  if (analysis.resolution.length > MAX_TEXT_LENGTH) {
    throw new Error(`Runbook "${runbookId}": known case "${caseId}" resolution exceeds ${MAX_TEXT_LENGTH} characters`);
  }
  if (analysis.errorDetails !== undefined && analysis.errorDetails.length > MAX_TEXT_LENGTH) {
    throw new Error(
      `Runbook "${runbookId}": known case "${caseId}" errorDetails exceeds ${MAX_TEXT_LENGTH} characters`,
    );
  }
  if (analysis.analysisType === 'IGNORABLE' && (analysis.ignoreReasonCode ?? '').trim() === '') {
    throw new Error(`Runbook "${runbookId}": known case "${caseId}" is IGNORABLE without an ignoreReasonCode`);
  }
  if (analysis.ignoreReasonCode !== undefined && analysis.ignoreReasonCode.length > MAX_IGNORE_REASON_CODE_LENGTH) {
    throw new Error(
      `Runbook "${runbookId}": known case "${caseId}" ignoreReasonCode exceeds ${MAX_IGNORE_REASON_CODE_LENGTH} characters`,
    );
  }

  for (const name of analysis.downstreams ?? []) {
    assertInCatalog(runbookId, caseId, name, catalog, product);
  }
  assertBoundedNames(runbookId, caseId, analysis.finalActions ?? [], 'finalActions');
  for (const resource of analysis.resources ?? []) {
    assertBoundedNames(runbookId, caseId, [resource.name], 'resources');
    if (resource.type !== undefined && resource.type.length > MAX_NAME_LENGTH) {
      throw new Error(`Runbook "${runbookId}": known case "${caseId}" declares a resource type longer than 255`);
    }
  }
  assertLinks(runbookId, caseId, analysis.links ?? []);
}

/** Fails on a value outside the catalog of the declared product (§5.1.2). */
function assertInCatalog(
  runbookId: string,
  caseId: string | undefined,
  name: string,
  catalog: ReadonlySet<string>,
  product: RunbookProduct,
): void {
  if (catalog.has(name)) return;
  throw new Error(`${where(runbookId, caseId)}: downstream "${name}" is outside the ${product} catalog`);
}

function assertBoundedNames(
  runbookId: string,
  caseId: string | undefined,
  names: ReadonlyArray<string>,
  field: string,
): void {
  for (const name of names) {
    if (name.trim() === '') {
      throw new Error(`${where(runbookId, caseId)}: ${field} declares an empty name`);
    }
    if (name.length > MAX_NAME_LENGTH) {
      throw new Error(`${where(runbookId, caseId)}: ${field} name "${name}" exceeds ${MAX_NAME_LENGTH} characters`);
    }
  }
  const unique = new Set(names);
  if (unique.size !== names.length) {
    throw new Error(`${where(runbookId, caseId)}: ${field} declares duplicate names`);
  }
}

function assertLinks(
  runbookId: string,
  caseId: string | undefined,
  links: ReadonlyArray<{ readonly url: string; readonly name?: string; readonly type?: string }>,
): void {
  for (const link of links) {
    if (!link.url.startsWith('http://') && !link.url.startsWith('https://')) {
      throw new Error(`${where(runbookId, caseId)}: link "${link.url}" is not an http/https URL`);
    }
    if (link.url.length > MAX_URL_LENGTH) {
      throw new Error(`${where(runbookId, caseId)}: link URL exceeds ${MAX_URL_LENGTH} characters`);
    }
    if (link.name !== undefined && link.name.length > MAX_NAME_LENGTH) {
      throw new Error(`${where(runbookId, caseId)}: link name exceeds ${MAX_NAME_LENGTH} characters`);
    }
    if (link.type !== undefined && link.type.length > MAX_LINK_TYPE_LENGTH) {
      throw new Error(`${where(runbookId, caseId)}: link type exceeds ${MAX_LINK_TYPE_LENGTH} characters`);
    }
  }
}

/**
 * Bounds the worst-case draft: defaults plus every annotated case merged together
 * is the largest payload a single run can emit.
 */
function assertDraftBudget(runbookId: string, runbook: Runbook): void {
  const worstCase = {
    defaults: runbook.analysisDefaults,
    cases: runbook.knownCases.map((knownCase) => knownCase.analysis).filter((analysis) => analysis !== undefined),
  };
  const bytes = Buffer.byteLength(JSON.stringify(worstCase), 'utf8');
  if (bytes > MAX_DRAFT_BYTES) {
    throw new Error(`Runbook "${runbookId}": potential analysis draft is ${bytes} bytes, over the 64 KiB budget`);
  }
}

function where(runbookId: string, caseId: string | undefined): string {
  return caseId === undefined ? `Runbook "${runbookId}" defaults` : `Runbook "${runbookId}": known case "${caseId}"`;
}
