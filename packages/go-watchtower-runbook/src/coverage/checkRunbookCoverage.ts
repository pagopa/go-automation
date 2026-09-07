import { createRequire } from 'node:module';

import type { Ajv as AjvInstance, AnySchema, Options as AjvOptions, ValidateFunction } from 'ajv';
import type { KnownCase, RunbookAnalysisDefaults, RunbookProduct } from '@go-automation/go-runbook';
import { INTEROP_DOWNSTREAMS, SEND_DOWNSTREAMS } from '@go-automation/go-runbook';
import type { AutomaticRunbookRegistry } from '@go-automation/go-runbook/catalog';
import type { IgnoreReasonDto, ProductCensus, ProductDto } from '@go-automation/go-watchtower-client';

import type { CoverageIssue, CoverageIssueCode } from './CoverageIssue.js';
import { COVERAGE_ERROR_CODES, COVERAGE_WARNING_CODES } from './CoverageIssue.js';
import type { CoverageReport } from './CoverageReport.js';

type AjvConstructor = new (options?: AjvOptions) => AjvInstance;

const require = createRequire(import.meta.url);
const Ajv = require('ajv') as AjvConstructor;

/** Watchtower bounds registry names at API level; longer rows are unreachable from a draft. */
const MAX_CENSUS_NAME_LENGTH = 255;

const DOWNSTREAM_CATALOGS: Readonly<Record<RunbookProduct, ReadonlyArray<string>>> = {
  SEND: Object.values(SEND_DOWNSTREAMS),
  INTEROP: Object.values(INTEROP_DOWNSTREAMS),
};

/** Explicit domain mapping: runbook products must match these Watchtower product names exactly. */
const WATCHTOWER_PRODUCT_NAMES: Readonly<Record<RunbookProduct, string>> = {
  SEND: 'SEND',
  INTEROP: 'INTEROP',
};

export interface RunbookCoverageInput {
  readonly registry: AutomaticRunbookRegistry;
  /** Watchtower products used to resolve each declared `RunbookProduct` by exact name. */
  readonly products: ReadonlyArray<ProductDto>;
  /** Census of every Watchtower product the alarms may belong to. */
  readonly census: ReadonlyArray<ProductCensus>;
  /** Ignore reasons are global, hence outside `ProductCensus`. */
  readonly ignoreReasons: ReadonlyArray<IgnoreReasonDto>;
}

/**
 * Compares every reference declared by the registered runbooks with the
 * Watchtower census, so a configuration gap surfaces before the rollout instead
 * of blocking an apply in production.
 *
 * Pure: no network, logging or filesystem — the caller loads the census. The
 * match is exact and case-sensitive like the apply; a case-insensitive near miss
 * only produces a suggestion. Complexity: O(R + N) over references and census.
 *
 * @param input - Registry plus the already loaded census and ignore reasons
 * @returns The data-only coverage report
 */
export async function checkRunbookCoverage(input: RunbookCoverageInput): Promise<CoverageReport> {
  await Promise.resolve();
  const errors: CoverageIssue[] = [];
  const warnings: CoverageIssue[] = [];
  const declarations = extractDeclarations(input.registry);
  const censusByProductId = new Map(input.census.map((entry) => [entry.productId, entry]));
  const productIndexes = buildProductIndexes(input.products, censusByProductId, errors);
  const alarmOwners = buildAlarmOwnerIndex(input.census);

  const resolved = resolveProducts(declarations, alarmOwners, productIndexes, errors, warnings);
  let checkedKnownCases = 0;
  let checkedReferences = 0;

  for (const declaration of declarations) {
    checkedKnownCases += declaration.knownCases.length;
    const productId = resolved.get(declaration.key);
    const census = productId === undefined ? undefined : censusByProductId.get(productId);
    if (census === undefined) continue;
    checkedReferences += checkDeclaration(declaration, census, input.ignoreReasons, errors, warnings);
  }

  checkCatalogDrift(declarations, resolved, censusByProductId, warnings);
  checkCensusBounds(input.census, warnings);

  return {
    checkedRunbooks: declarations.length,
    checkedKnownCases,
    checkedReferences,
    errors,
    warnings,
  };
}

// ─── declarations ─────────────────────────────────────────────────────────────

interface RunbookDeclaration {
  readonly key: string;
  readonly product: RunbookProduct;
  readonly alarmNames: ReadonlyArray<string>;
  readonly defaults: RunbookAnalysisDefaults | undefined;
  readonly knownCases: ReadonlyArray<KnownCase>;
}

function extractDeclarations(registry: AutomaticRunbookRegistry): ReadonlyArray<RunbookDeclaration> {
  const declarations: RunbookDeclaration[] = [];
  for (const descriptor of registry.listDescriptors()) {
    const resolved = registry.resolveByKey(descriptor.key);
    if (resolved === undefined) continue;
    const runbook = resolved.build();
    declarations.push({
      key: descriptor.key,
      product: resolved.product,
      alarmNames: descriptor.alarmNames,
      defaults: runbook.analysisDefaults,
      knownCases: runbook.knownCases,
    });
  }
  return declarations;
}

// ─── runbook → Watchtower product ─────────────────────────────────────────────

interface ProductIndexes {
  readonly byId: ReadonlyMap<string, ProductDto>;
  readonly byRunbookProduct: ReadonlyMap<RunbookProduct, ProductDto>;
}

function buildProductIndexes(
  products: ReadonlyArray<ProductDto>,
  censusByProductId: ReadonlyMap<string, ProductCensus>,
  errors: CoverageIssue[],
): ProductIndexes {
  const byId = new Map(products.map((product) => [product.id, product]));
  const byName = new Map(products.map((product) => [product.name, product]));
  const byRunbookProduct = new Map<RunbookProduct, ProductDto>();
  const runbookProductById = new Map<string, RunbookProduct>();

  for (const [runbookProduct, watchtowerProductName] of Object.entries(WATCHTOWER_PRODUCT_NAMES) as ReadonlyArray<
    [RunbookProduct, string]
  >) {
    const watchtowerProduct = byName.get(watchtowerProductName);
    if (watchtowerProduct === undefined) {
      errors.push({
        severity: 'ERROR',
        code: COVERAGE_ERROR_CODES.PRODUCT_NOT_FOUND,
        product: runbookProduct,
        field: 'product',
        declaredValue: watchtowerProductName,
        message: `Watchtower product "${watchtowerProductName}" required by ${runbookProduct} runbooks was not found`,
      });
      continue;
    }

    if (!censusByProductId.has(watchtowerProduct.id)) {
      errors.push({
        severity: 'ERROR',
        code: COVERAGE_ERROR_CODES.PRODUCT_CENSUS_MISSING,
        product: runbookProduct,
        field: 'product',
        declaredValue: watchtowerProduct.id,
        message: `Watchtower product "${watchtowerProductName}" exists, but its census is missing`,
      });
      continue;
    }

    const previouslyMappedProduct = runbookProductById.get(watchtowerProduct.id);
    if (previouslyMappedProduct !== undefined) {
      errors.push({
        severity: 'ERROR',
        code: COVERAGE_ERROR_CODES.PRODUCT_MAPPING_CONFLICT,
        product: runbookProduct,
        field: 'product',
        declaredValue: watchtowerProduct.id,
        message:
          `Runbook products ${previouslyMappedProduct} and ${runbookProduct} map to the same ` +
          `Watchtower product id "${watchtowerProduct.id}"`,
      });
      continue;
    }

    byRunbookProduct.set(runbookProduct, watchtowerProduct);
    runbookProductById.set(watchtowerProduct.id, runbookProduct);
  }

  return { byId, byRunbookProduct };
}

function buildAlarmOwnerIndex(census: ReadonlyArray<ProductCensus>): ReadonlyMap<string, ReadonlySet<string>> {
  const owners = new Map<string, Set<string>>();
  for (const entry of census) {
    for (const alarm of entry.alarms) {
      const current = owners.get(alarm.name) ?? new Set<string>();
      current.add(entry.productId);
      owners.set(alarm.name, current);
    }
  }
  return owners;
}

/**
 * Maps each runbook onto the Watchtower product matching its declared product.
 *
 * An alarm the census ignores is only reported: it produces no `AlarmEvent`, so it
 * can never block an apply. Every censused alarm must be owned by the explicitly
 * mapped Watchtower product; alarm ownership is never used to infer that mapping.
 */
function resolveProducts(
  declarations: ReadonlyArray<RunbookDeclaration>,
  alarmOwners: ReadonlyMap<string, ReadonlySet<string>>,
  products: ProductIndexes,
  errors: CoverageIssue[],
  warnings: CoverageIssue[],
): ReadonlyMap<string, string> {
  const resolved = new Map<string, string>();

  for (const declaration of declarations) {
    const expectedProduct = products.byRunbookProduct.get(declaration.product);
    if (expectedProduct === undefined) continue;

    // Keep checking references against the declared product even when an alarm
    // mismatch below makes the final report blocking.
    resolved.set(declaration.key, expectedProduct.id);

    for (const alarmName of declaration.alarmNames) {
      const owners = alarmOwners.get(alarmName);
      if (owners === undefined || owners.size === 0) {
        warnings.push({
          severity: 'WARNING',
          code: COVERAGE_WARNING_CODES.ALARM_NOT_CENSUSED,
          runbookKey: declaration.key,
          product: declaration.product,
          field: 'alarmNames',
          declaredValue: alarmName,
          message: `Alarm "${alarmName}" is not censused: the runbook handles it, Watchtower will never trigger it`,
        });
        continue;
      }

      if (owners.size > 1) {
        errors.push({
          severity: 'ERROR',
          code: COVERAGE_ERROR_CODES.ALARM_PRODUCT_AMBIGUOUS,
          runbookKey: declaration.key,
          product: declaration.product,
          field: 'alarmNames',
          declaredValue: alarmName,
          message: `Alarm "${alarmName}" belongs to multiple Watchtower products: ${[...owners].sort().join(', ')}`,
        });
        continue;
      }

      const actualProductId = owners.values().next().value;
      if (actualProductId === undefined || actualProductId === expectedProduct.id) continue;

      const actualProduct = products.byId.get(actualProductId);
      errors.push({
        severity: 'ERROR',
        code: COVERAGE_ERROR_CODES.ALARM_PRODUCT_MISMATCH,
        runbookKey: declaration.key,
        product: declaration.product,
        field: 'alarmNames',
        declaredValue: alarmName,
        message:
          `Runbook "${declaration.key}" declares product ${declaration.product}, but alarm "${alarmName}" ` +
          `belongs to Watchtower product "${actualProduct?.name ?? actualProductId}"`,
      });
    }
  }

  return resolved;
}

// ─── declared references ↔ census ─────────────────────────────────────────────

function checkDeclaration(
  declaration: RunbookDeclaration,
  census: ProductCensus,
  ignoreReasons: ReadonlyArray<IgnoreReasonDto>,
  errors: CoverageIssue[],
  warnings: CoverageIssue[],
): number {
  const resourcesByName = new Map(census.resources.map((resource) => [resource.name, resource]));
  const downstreamNames = new Set(census.downstreams.map((downstream) => downstream.name));
  const finalActionNames = new Set(census.finalActions.map((action) => action.name));
  const runbookNames = new Set(census.runbooks.map((runbook) => runbook.name));
  const ignoreReasonsByCode = new Map(ignoreReasons.map((reason) => [reason.code, reason]));
  let checked = 0;

  const documentName = declaration.defaults?.runbookName;
  if (documentName !== undefined && !runbookNames.has(documentName)) {
    warnings.push({
      severity: 'WARNING',
      code: COVERAGE_WARNING_CODES.RUNBOOK_DOCUMENT_NOT_FOUND,
      runbookKey: declaration.key,
      product: declaration.product,
      field: 'runbookName',
      declaredValue: documentName,
      ...suggestion(documentName, runbookNames),
      message: `Documental runbook "${documentName}" is not censused; the analysis simply stays without one`,
    });
  }

  checked += checkReferenceGroup(declaration, undefined, declaration.defaults, {
    resourcesByName,
    downstreamNames,
    finalActionNames,
    errors,
  });

  for (const knownCase of declaration.knownCases) {
    const analysis = knownCase.analysis;
    if (analysis === undefined) continue;
    checked += checkReferenceGroup(declaration, knownCase.id, analysis, {
      resourcesByName,
      downstreamNames,
      finalActionNames,
      errors,
    });

    if (analysis.ignoreReasonCode === undefined) continue;
    checked += 1;
    const reason = ignoreReasonsByCode.get(analysis.ignoreReasonCode);
    if (reason === undefined) {
      errors.push({
        severity: 'ERROR',
        code: COVERAGE_ERROR_CODES.IGNORE_REASON_NOT_FOUND,
        runbookKey: declaration.key,
        knownCaseId: knownCase.id,
        product: declaration.product,
        field: 'ignoreReasonCode',
        declaredValue: analysis.ignoreReasonCode,
        ...suggestion(analysis.ignoreReasonCode, new Set(ignoreReasonsByCode.keys())),
        message: `Ignore reason "${analysis.ignoreReasonCode}" is not censused`,
      });
      continue;
    }
    checkIgnoreDetails(declaration, knownCase.id, analysis.ignoreDetails, reason, errors);
  }

  return checked;
}

interface ReferenceIndexes {
  readonly resourcesByName: ReadonlyMap<string, { readonly name: string; readonly type?: { readonly name: string } }>;
  readonly downstreamNames: ReadonlySet<string>;
  readonly finalActionNames: ReadonlySet<string>;
  readonly errors: CoverageIssue[];
}

function checkReferenceGroup(
  declaration: RunbookDeclaration,
  knownCaseId: string | undefined,
  group: RunbookAnalysisDefaults | undefined,
  indexes: ReferenceIndexes,
): number {
  if (group === undefined) return 0;
  let checked = 0;

  for (const resource of group.resources ?? []) {
    checked += 1;
    const censused = indexes.resourcesByName.get(resource.name);
    if (censused === undefined) {
      indexes.errors.push({
        severity: 'ERROR',
        code: COVERAGE_ERROR_CODES.RESOURCE_NOT_FOUND,
        runbookKey: declaration.key,
        ...(knownCaseId === undefined ? {} : { knownCaseId }),
        product: declaration.product,
        field: 'resources',
        declaredValue: resource.name,
        ...suggestion(resource.name, new Set(indexes.resourcesByName.keys())),
        message: `Resource "${resource.name}" is not censused for the product`,
      });
      continue;
    }
    if (resource.type !== undefined && censused.type?.name !== resource.type) {
      indexes.errors.push({
        severity: 'ERROR',
        code: COVERAGE_ERROR_CODES.RESOURCE_TYPE_MISMATCH,
        runbookKey: declaration.key,
        ...(knownCaseId === undefined ? {} : { knownCaseId }),
        product: declaration.product,
        field: 'resources.type',
        declaredValue: resource.type,
        ...(censused.type === undefined ? {} : { suggestedValue: censused.type.name }),
        message: `Resource "${resource.name}" is censused as "${censused.type?.name ?? 'untyped'}", not "${resource.type}"`,
      });
    }
  }

  checked += checkNames(declaration, knownCaseId, group.downstreams ?? [], indexes.downstreamNames, {
    code: COVERAGE_ERROR_CODES.DOWNSTREAM_NOT_FOUND,
    field: 'downstreams',
    label: 'Downstream',
    errors: indexes.errors,
  });
  checked += checkNames(declaration, knownCaseId, group.finalActions ?? [], indexes.finalActionNames, {
    code: COVERAGE_ERROR_CODES.FINAL_ACTION_NOT_FOUND,
    field: 'finalActions',
    label: 'Final action',
    errors: indexes.errors,
  });
  return checked;
}

interface NameCheckOptions {
  readonly code: CoverageIssueCode;
  readonly field: string;
  readonly label: string;
  readonly errors: CoverageIssue[];
}

function checkNames(
  declaration: RunbookDeclaration,
  knownCaseId: string | undefined,
  declared: ReadonlyArray<string>,
  censused: ReadonlySet<string>,
  options: NameCheckOptions,
): number {
  for (const name of declared) {
    if (censused.has(name)) continue;
    options.errors.push({
      severity: 'ERROR',
      code: options.code,
      runbookKey: declaration.key,
      ...(knownCaseId === undefined ? {} : { knownCaseId }),
      product: declaration.product,
      field: options.field,
      declaredValue: name,
      ...suggestion(name, censused),
      message: `${options.label} "${name}" is not censused for the product`,
    });
  }
  return declared.length;
}

// ─── ignore details ───────────────────────────────────────────────────────────

function checkIgnoreDetails(
  declaration: RunbookDeclaration,
  knownCaseId: string,
  details: Readonly<Record<string, unknown>> | undefined,
  reason: IgnoreReasonDto,
  errors: CoverageIssue[],
): void {
  const schema = reason.detailsSchema;
  if (schema === null || schema === undefined) return;

  let validate: ValidateFunction;
  try {
    validate = compileSchema(schema);
  } catch (error: unknown) {
    errors.push({
      severity: 'ERROR',
      code: COVERAGE_ERROR_CODES.IGNORE_DETAILS_SCHEMA_INVALID,
      runbookKey: declaration.key,
      knownCaseId,
      product: declaration.product,
      field: 'ignoreDetails',
      declaredValue: reason.code,
      message: `detailsSchema of "${reason.code}" does not compile: ${messageOf(error)}`,
    });
    return;
  }

  if (validate(details ?? {})) return;
  const detail = (validate.errors ?? [])
    .map((issue) => `${issue.instancePath === '' ? '/' : issue.instancePath} ${issue.message ?? 'invalid'}`)
    .join('; ');
  errors.push({
    severity: 'ERROR',
    code: COVERAGE_ERROR_CODES.IGNORE_DETAILS_INVALID,
    runbookKey: declaration.key,
    knownCaseId,
    product: declaration.product,
    field: 'ignoreDetails',
    declaredValue: reason.code,
    message: `ignoreDetails do not satisfy the schema of "${reason.code}": ${detail}`,
  });
}

/**
 * Compiles a census schema in non-strict mode.
 *
 * Watchtower seeds carry applicative keywords such as `x-ui`, which Ajv would
 * reject in strict mode; they are presentation hints, not validation rules.
 */
function compileSchema(schema: AnySchema): ValidateFunction {
  const ajv = new Ajv({ strict: false, allErrors: true });
  return ajv.compile(schema);
}

// ─── drift ────────────────────────────────────────────────────────────────────

function checkCatalogDrift(
  declarations: ReadonlyArray<RunbookDeclaration>,
  resolved: ReadonlyMap<string, string>,
  censusByProductId: ReadonlyMap<string, ProductCensus>,
  warnings: CoverageIssue[],
): void {
  const productIdByDeclared = new Map<RunbookProduct, string>();
  for (const declaration of declarations) {
    const productId = resolved.get(declaration.key);
    if (productId !== undefined) productIdByDeclared.set(declaration.product, productId);
  }

  for (const [product, catalog] of Object.entries(DOWNSTREAM_CATALOGS) as ReadonlyArray<
    [RunbookProduct, ReadonlyArray<string>]
  >) {
    const productId = productIdByDeclared.get(product);
    const census = productId === undefined ? undefined : censusByProductId.get(productId);
    if (census === undefined) continue;
    const censused = new Set(census.downstreams.map((downstream) => downstream.name));

    for (const value of catalog) {
      if (censused.has(value)) continue;
      warnings.push({
        severity: 'WARNING',
        code: COVERAGE_WARNING_CODES.CATALOG_VALUE_NOT_CENSUSED,
        product,
        field: 'downstreams',
        declaredValue: value,
        ...suggestion(value, censused),
        message: `Catalog value "${value}" no longer exists in the ${product} census`,
      });
    }
    for (const name of censused) {
      if (catalog.includes(name)) continue;
      warnings.push({
        severity: 'WARNING',
        code: COVERAGE_WARNING_CODES.CENSUS_VALUE_NOT_CATALOGUED,
        product,
        field: 'downstreams',
        declaredValue: name,
        message: `Census value "${name}" is missing from the ${product} catalog`,
      });
    }
  }
}

function checkCensusBounds(census: ReadonlyArray<ProductCensus>, warnings: CoverageIssue[]): void {
  for (const entry of census) {
    const named = [
      ...entry.resources.map((resource) => ({ field: 'resources', name: resource.name })),
      ...entry.downstreams.map((downstream) => ({ field: 'downstreams', name: downstream.name })),
      ...entry.finalActions.map((action) => ({ field: 'finalActions', name: action.name })),
    ];
    for (const { field, name } of named) {
      if (name.length <= MAX_CENSUS_NAME_LENGTH) continue;
      warnings.push({
        severity: 'WARNING',
        code: COVERAGE_WARNING_CODES.CENSUS_NAME_TOO_LONG,
        product: entry.productId,
        field,
        declaredValue: name.slice(0, MAX_CENSUS_NAME_LENGTH),
        message: `Census name exceeds ${MAX_CENSUS_NAME_LENGTH} characters and is unreachable from any draft`,
      });
    }
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Case-insensitive near miss, offered as a hint only: the gate stays exact. */
function suggestion(declared: string, censused: ReadonlySet<string>): { readonly suggestedValue?: string } {
  const normalized = declared.trim().toLowerCase();
  for (const candidate of censused) {
    if (candidate.trim().toLowerCase() === normalized && candidate !== declared) {
      return { suggestedValue: candidate };
    }
  }
  return {};
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
