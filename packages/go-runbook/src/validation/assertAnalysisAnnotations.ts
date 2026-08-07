import type { KnownCaseAnalysis } from '../types/KnownCaseAnalysis.js';
import type { AnalysisLinkRef } from '../types/AnalysisLinkRef.js';
import type { AnalysisResourceRef } from '../types/AnalysisResourceRef.js';
import type { Runbook } from '../types/Runbook.js';
import type { RunbookProduct } from '../types/RunbookProduct.js';
import { INTEROP_DOWNSTREAMS } from '../analysis/downstreams/INTEROP_DOWNSTREAMS.js';
import { SEND_DOWNSTREAMS } from '../analysis/downstreams/SEND_DOWNSTREAMS.js';
import { buildPotentialAnalysisDrafts } from '../output/buildAnalysisDraft.js';

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

type AnalysisReferences = Pick<KnownCaseAnalysis, 'resources' | 'downstreams' | 'finalActions' | 'links'>;

interface ReferenceDeclaration<T> {
  readonly value: T;
  readonly location: string;
}

type ReferenceEqualityFn<T> = (left: T, right: T) => boolean;

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

  const defaults = runbook.analysisDefaults;
  if (defaults?.runbookName !== undefined) {
    assertBoundedNames(runbookId, undefined, [defaults.runbookName], 'runbookName');
  }
  assertReferences(runbookId, undefined, defaults ?? {}, catalog, product);

  for (const knownCase of runbook.knownCases) {
    const analysis = knownCase.analysis;
    if (analysis === undefined) {
      throw new Error(`Runbook "${runbookId}": known case "${knownCase.id}" is missing the analysis annotation`);
    }
    assertKnownCaseAnalysis(runbookId, knownCase.id, analysis, catalog, product);
  }

  assertNoReferenceConflicts(runbookId, runbook);
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
  if (analysis.ignoreDetails !== undefined && (analysis.ignoreReasonCode ?? '').trim() === '') {
    throw new Error(
      `Runbook "${runbookId}": known case "${caseId}" declares ignoreDetails without an ignoreReasonCode`,
    );
  }
  if (analysis.ignoreReasonCode !== undefined && analysis.ignoreReasonCode.length > MAX_IGNORE_REASON_CODE_LENGTH) {
    throw new Error(
      `Runbook "${runbookId}": known case "${caseId}" ignoreReasonCode exceeds ${MAX_IGNORE_REASON_CODE_LENGTH} characters`,
    );
  }

  assertReferences(runbookId, caseId, analysis, catalog, product);
}

function assertReferences(
  runbookId: string,
  caseId: string | undefined,
  references: AnalysisReferences,
  catalog: ReadonlySet<string>,
  product: RunbookProduct,
): void {
  for (const name of references.downstreams ?? []) {
    assertInCatalog(runbookId, caseId, name, catalog, product);
  }
  assertBoundedNames(runbookId, caseId, references.finalActions ?? [], 'finalActions');
  assertResources(runbookId, caseId, references.resources ?? []);
  assertLinks(runbookId, caseId, references.links ?? []);
}

function assertResources(
  runbookId: string,
  caseId: string | undefined,
  resources: ReadonlyArray<AnalysisResourceRef>,
): void {
  assertBoundedNames(
    runbookId,
    caseId,
    resources.map((resource) => resource.name),
    'resources',
  );
  for (const resource of resources) {
    if (resource.type !== undefined && (resource.type.trim() === '' || resource.type.length > MAX_NAME_LENGTH)) {
      throw new Error(`${where(runbookId, caseId)}: resource "${resource.name}" declares an invalid type`);
    }
  }
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

function assertLinks(runbookId: string, caseId: string | undefined, links: ReadonlyArray<AnalysisLinkRef>): void {
  for (const link of links) {
    if (!isAbsoluteHttpUrl(link.url)) {
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

function isAbsoluteHttpUrl(value: string): boolean {
  if (value.trim() !== value) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function assertNoReferenceConflicts(runbookId: string, runbook: Runbook): void {
  const resources = new Map<string, ReferenceDeclaration<AnalysisResourceRef>>();
  const links = new Map<string, ReferenceDeclaration<AnalysisLinkRef>>();
  const declarations: ReadonlyArray<{
    readonly caseId: string | undefined;
    readonly references: AnalysisReferences;
  }> = [
    { caseId: undefined, references: runbook.analysisDefaults ?? {} },
    ...runbook.knownCases
      .filter((knownCase) => knownCase.analysis !== undefined)
      .map((knownCase) => ({ caseId: knownCase.id, references: knownCase.analysis ?? {} })),
  ];

  for (const declaration of declarations) {
    const location = where(runbookId, declaration.caseId);
    for (const resource of declaration.references.resources ?? []) {
      assertNoConflict(resources, resource.name, resource, location, sameResource, 'resource');
    }
    for (const link of declaration.references.links ?? []) {
      assertNoConflict(links, link.url, link, location, sameLink, 'link');
    }
  }
}

function assertNoConflict<T>(
  declarations: Map<string, ReferenceDeclaration<T>>,
  key: string,
  value: T,
  location: string,
  equals: ReferenceEqualityFn<T>,
  kind: string,
): void {
  const previous = declarations.get(key);
  if (previous === undefined) {
    declarations.set(key, { value, location });
    return;
  }
  if (equals(previous.value, value)) return;
  throw new Error(`${location}: ${kind} "${key}" has conflicting metadata with ${previous.location}`);
}

function sameResource(left: AnalysisResourceRef, right: AnalysisResourceRef): boolean {
  return left.type === right.type && left.role === right.role;
}

function sameLink(left: AnalysisLinkRef, right: AnalysisLinkRef): boolean {
  return left.name === right.name && left.type === right.type;
}

/** Bounds the largest real draft envelope statically representable by the runbook. */
function assertDraftBudget(runbookId: string, runbook: Runbook): void {
  const largestBytes = buildPotentialAnalysisDrafts(runbook).reduce(
    (largest, draft) => Math.max(largest, Buffer.byteLength(JSON.stringify(draft), 'utf8')),
    0,
  );
  if (largestBytes <= MAX_DRAFT_BYTES) return;
  throw new Error(`Runbook "${runbookId}": potential analysis draft is ${largestBytes} bytes, over the 64 KiB budget`);
}

function where(runbookId: string, caseId: string | undefined): string {
  return caseId === undefined ? `Runbook "${runbookId}" defaults` : `Runbook "${runbookId}": known case "${caseId}"`;
}
