import { getErrorMessage } from '@pagopa/go-common/errors';
import type { KnownErrorAnalysis } from '../KnownErrorAnalysis.js';
import type { AnalysisLinkRef } from '../AnalysisLinkRef.js';
import type { AnalysisResourceRef } from '../AnalysisResourceRef.js';
import type { Runbook } from '../../../../engine/index.js';
import type { RunbookProduct } from '../../registration/RunbookProduct.js';
import { buildPotentialAnalysisDrafts } from '../draft/buildAnalysisDraft.js';
import { ANALYSIS_DRAFT_BOUNDS } from '../draft/analysisDraftBounds.js';
import type { AnalysisReferences } from './AnalysisReferences.js';
import type { ReferenceDeclaration } from './ReferenceDeclaration.js';
import type { ReferenceEqualityFn } from './ReferenceEqualityFn.js';

const MAX_NAME_LENGTH = ANALYSIS_DRAFT_BOUNDS.NAME_LENGTH;
const MAX_TEXT_LENGTH = ANALYSIS_DRAFT_BOUNDS.TEXT_LENGTH;
const MAX_URL_LENGTH = ANALYSIS_DRAFT_BOUNDS.URL_LENGTH;
const MAX_LINK_TYPE_LENGTH = ANALYSIS_DRAFT_BOUNDS.LINK_TYPE_LENGTH;
const MAX_IGNORE_REASON_CODE_LENGTH = ANALYSIS_DRAFT_BOUNDS.IGNORE_REASON_CODE_LENGTH;
const MAX_DRAFT_BYTES = ANALYSIS_DRAFT_BOUNDS.DRAFT_BYTES;
const MAX_ARRAY_ITEMS = ANALYSIS_DRAFT_BOUNDS.ARRAY_ITEMS;

/**
 * Rejects a runbook whose analysis annotations would produce an invalid or
 * unresolvable draft, so a configuration error fails in CI instead of blocking
 * the apply in production.
 *
 * Every known error of a registered runbook must carry `analysis`: without it the
 * apply would find no draft and block.
 *
 * @param runbook - The built runbook definition
 * @param product - Product declared on the registry entry, named in the errors
 * @param catalog - Downstream catalog of that product (injected by the inventory)
 * @throws Error on the first violation, naming runbook, case and field
 */
export function assertAnalysisAnnotations(
  runbook: Runbook,
  product: RunbookProduct,
  catalog: ReadonlySet<string>,
): void {
  const runbookId = runbook.metadata.id;

  const defaults = runbook.analysisDefaults;
  if (defaults?.runbookName !== undefined) {
    assertBoundedNames(runbookId, undefined, [defaults.runbookName], 'runbookName');
  }
  assertReferences(runbookId, undefined, defaults ?? {}, catalog, product);

  for (const knownError of runbook.knownErrors) {
    const analysis = knownError.analysis;
    if (analysis === undefined) {
      throw new Error(`Runbook "${runbookId}": known error "${knownError.code}" is missing the analysis annotation`);
    }
    assertKnownErrorAnalysis(runbookId, knownError.code, analysis, catalog, product);
  }

  assertNoReferenceConflicts(runbookId, runbook);
  assertDraftBudget(runbookId, runbook);
}

function assertKnownErrorAnalysis(
  runbookId: string,
  knownErrorCode: string,
  analysis: KnownErrorAnalysis,
  catalog: ReadonlySet<string>,
  product: RunbookProduct,
): void {
  if (analysis.resolution.trim() === '') {
    throw new Error(`Runbook "${runbookId}": known error "${knownErrorCode}" declares an empty resolution`);
  }
  if (analysis.resolution.length > MAX_TEXT_LENGTH) {
    throw new Error(
      `Runbook "${runbookId}": known error "${knownErrorCode}" resolution exceeds ${MAX_TEXT_LENGTH} characters`,
    );
  }
  if (analysis.errorDetails !== undefined && analysis.errorDetails.length > MAX_TEXT_LENGTH) {
    throw new Error(
      `Runbook "${runbookId}": known error "${knownErrorCode}" errorDetails exceeds ${MAX_TEXT_LENGTH} characters`,
    );
  }
  if (analysis.analysisType === 'IGNORABLE' && (analysis.ignoreReasonCode ?? '').trim() === '') {
    throw new Error(`Runbook "${runbookId}": known error "${knownErrorCode}" is IGNORABLE without an ignoreReasonCode`);
  }
  if (analysis.ignoreDetails !== undefined && (analysis.ignoreReasonCode ?? '').trim() === '') {
    throw new Error(
      `Runbook "${runbookId}": known error "${knownErrorCode}" declares ignoreDetails without an ignoreReasonCode`,
    );
  }
  if (analysis.ignoreReasonCode !== undefined && analysis.ignoreReasonCode.length > MAX_IGNORE_REASON_CODE_LENGTH) {
    throw new Error(
      `Runbook "${runbookId}": known error "${knownErrorCode}" ignoreReasonCode exceeds ${MAX_IGNORE_REASON_CODE_LENGTH} characters`,
    );
  }

  assertReferences(runbookId, knownErrorCode, analysis, catalog, product);
}

function assertReferences(
  runbookId: string,
  knownErrorCode: string | undefined,
  references: AnalysisReferences,
  catalog: ReadonlySet<string>,
  product: RunbookProduct,
): void {
  for (const name of references.downstreams ?? []) {
    assertInCatalog(runbookId, knownErrorCode, name, catalog, product);
  }
  assertBoundedNames(runbookId, knownErrorCode, references.finalActions ?? [], 'finalActions');
  assertResources(runbookId, knownErrorCode, references.resources ?? []);
  assertLinks(runbookId, knownErrorCode, references.links ?? []);
}

function assertResources(
  runbookId: string,
  knownErrorCode: string | undefined,
  resources: ReadonlyArray<AnalysisResourceRef>,
): void {
  assertBoundedNames(
    runbookId,
    knownErrorCode,
    resources.map((resource) => resource.name),
    'resources',
  );
  for (const resource of resources) {
    if (resource.type !== undefined && (resource.type.trim() === '' || resource.type.length > MAX_NAME_LENGTH)) {
      throw new Error(`${where(runbookId, knownErrorCode)}: resource "${resource.name}" declares an invalid type`);
    }
  }
}

/** Fails on a value outside the catalog of the declared product. */
function assertInCatalog(
  runbookId: string,
  knownErrorCode: string | undefined,
  name: string,
  catalog: ReadonlySet<string>,
  product: RunbookProduct,
): void {
  if (catalog.has(name)) return;
  throw new Error(`${where(runbookId, knownErrorCode)}: downstream "${name}" is outside the ${product} catalog`);
}

function assertBoundedNames(
  runbookId: string,
  knownErrorCode: string | undefined,
  names: ReadonlyArray<string>,
  field: string,
): void {
  for (const name of names) {
    if (name.trim() === '') {
      throw new Error(`${where(runbookId, knownErrorCode)}: ${field} declares an empty name`);
    }
    if (name.length > MAX_NAME_LENGTH) {
      throw new Error(
        `${where(runbookId, knownErrorCode)}: ${field} name "${name}" exceeds ${MAX_NAME_LENGTH} characters`,
      );
    }
  }
  const unique = new Set(names);
  if (unique.size !== names.length) {
    throw new Error(`${where(runbookId, knownErrorCode)}: ${field} declares duplicate names`);
  }
}

function assertLinks(
  runbookId: string,
  knownErrorCode: string | undefined,
  links: ReadonlyArray<AnalysisLinkRef>,
): void {
  for (const link of links) {
    if (!isAbsoluteHttpUrl(link.url)) {
      throw new Error(`${where(runbookId, knownErrorCode)}: link "${link.url}" is not an http/https URL`);
    }
    if (link.url.length > MAX_URL_LENGTH) {
      throw new Error(`${where(runbookId, knownErrorCode)}: link URL exceeds ${MAX_URL_LENGTH} characters`);
    }
    if (link.name !== undefined && link.name.length > MAX_NAME_LENGTH) {
      throw new Error(`${where(runbookId, knownErrorCode)}: link name exceeds ${MAX_NAME_LENGTH} characters`);
    }
    if (link.type !== undefined && link.type.length > MAX_LINK_TYPE_LENGTH) {
      throw new Error(`${where(runbookId, knownErrorCode)}: link type exceeds ${MAX_LINK_TYPE_LENGTH} characters`);
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
    readonly knownErrorCode: string | undefined;
    readonly references: AnalysisReferences;
  }> = [
    { knownErrorCode: undefined, references: runbook.analysisDefaults ?? {} },
    ...runbook.knownErrors
      .filter((knownError) => knownError.analysis !== undefined)
      .map((knownError) => ({ knownErrorCode: knownError.code, references: knownError.analysis ?? {} })),
  ];

  for (const declaration of declarations) {
    const location = where(runbookId, declaration.knownErrorCode);
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

/**
 * Bounds the largest real draft envelope statically representable by the runbook: its bytes, and the items of the
 * lists the draft never shortens (`resources`, `downstreams`) in the union of every annotated case.
 */
function assertDraftBudget(runbookId: string, runbook: Runbook): void {
  let drafts: ReturnType<typeof buildPotentialAnalysisDrafts>;
  try {
    drafts = buildPotentialAnalysisDrafts(runbook);
  } catch (error: unknown) {
    throw new Error(`Runbook "${runbookId}": ${getErrorMessage(error)}`, {
      cause: error,
    });
  }
  for (const draft of drafts) {
    for (const list of ['resources', 'downstreams'] as const) {
      if (draft[list].length > MAX_ARRAY_ITEMS) {
        throw new Error(
          `Runbook "${runbookId}": potential analysis draft has ${String(draft[list].length)} ${list}, over the ${String(MAX_ARRAY_ITEMS)} items of the contract`,
        );
      }
    }
  }
  const largestBytes = drafts.reduce(
    (largest, draft) => Math.max(largest, Buffer.byteLength(JSON.stringify(draft), 'utf8')),
    0,
  );
  if (largestBytes <= MAX_DRAFT_BYTES) return;
  throw new Error(`Runbook "${runbookId}": potential analysis draft is ${largestBytes} bytes, over the 64 KiB budget`);
}

function where(runbookId: string, knownErrorCode: string | undefined): string {
  return knownErrorCode === undefined
    ? `Runbook "${runbookId}" defaults`
    : `Runbook "${runbookId}": known error "${knownErrorCode}"`;
}
