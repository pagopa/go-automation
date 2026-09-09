import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { KnownCase, KnownCaseAnalysis, Runbook, RunbookAnalysisDefaults } from '@go-automation/go-runbook';
import { INTEROP_DOWNSTREAMS, SEND_DOWNSTREAMS } from '@go-automation/go-runbook';
import { AutomaticRunbookRegistry } from '@go-automation/go-runbook/catalog';
import type { AutomaticRunbookRegistration } from '@go-automation/go-runbook/catalog';
import type { IgnoreReasonDto, ProductCensus, ProductDto } from '@go-automation/go-watchtower-client';

import { checkRunbookCoverage } from '../checkRunbookCoverage.js';

const SEND_PRODUCT_ID = 'product-send';
const INTEROP_PRODUCT_ID = 'product-interop';
const ALARM = 'pn-delivery-B2B-ApiGwAlarm';
const INTEROP_ALARM = 'interop-alarm';

const PRODUCTS: ReadonlyArray<ProductDto> = [
  product(SEND_PRODUCT_ID, 'SEND'),
  product(INTEROP_PRODUCT_ID, 'INTEROP'),
];

describe('checkRunbookCoverage', () => {
  it('reports no error when every declared reference is censused', async () => {
    const report = await run({
      analysis: {
        downstreams: [SEND_DOWNSTREAMS.APP_IO],
        finalActions: ['Nessuna azione'],
        resources: [{ name: 'pn-delivery', type: 'Service' }],
      },
    });

    assert.deepStrictEqual(report.errors, []);
    assert.strictEqual(report.checkedRunbooks, 1);
    assert.strictEqual(report.checkedKnownCases, 1);
    assert.ok(report.checkedReferences >= 3);
  });

  it('blocks a declared downstream missing from the product census', async () => {
    const report = await run({ analysis: { downstreams: [SEND_DOWNSTREAMS.KONECTA] } });

    const error = report.errors.find((issue) => issue.code === 'DOWNSTREAM_NOT_FOUND');
    assert.ok(error, 'expected a DOWNSTREAM_NOT_FOUND error');
    assert.strictEqual(error.declaredValue, 'Konecta');
    assert.strictEqual(error.knownCaseId, 'primary');
  });

  it('suggests the censused spelling on a case-only mismatch without accepting it', async () => {
    const report = await run({
      analysis: { finalActions: ['nessuna azione'] },
    });

    const error = report.errors.find((issue) => issue.code === 'FINAL_ACTION_NOT_FOUND');
    assert.ok(error, 'the gate stays case-sensitive');
    assert.strictEqual(error.suggestedValue, 'Nessuna azione');
  });

  it('blocks a resource whose censused type differs from the declared one', async () => {
    const report = await run({ analysis: { resources: [{ name: 'pn-delivery', type: 'Lambda' }] } });

    const error = report.errors.find((issue) => issue.code === 'RESOURCE_TYPE_MISMATCH');
    assert.ok(error);
    assert.strictEqual(error.suggestedValue, 'Service');
  });

  it('only reports an alarm that no product censuses', async () => {
    const report = await run({ analysis: {}, alarmNames: ['unknown-alarm'] });

    assert.deepStrictEqual(report.errors, []);
    assert.ok(report.warnings.some((issue) => issue.code === 'ALARM_NOT_CENSUSED'));
  });

  it('still checks the references when only some alarms are censused', async () => {
    const report = await run({
      analysis: { downstreams: [SEND_DOWNSTREAMS.KONECTA] },
      alarmNames: [ALARM, 'unknown-alarm'],
    });

    assert.ok(report.warnings.some((issue) => issue.code === 'ALARM_NOT_CENSUSED'));
    // Il prodotto resta risolvibile dagli allarmi censiti: i riferimenti vanno comunque verificati.
    assert.ok(report.errors.some((issue) => issue.code === 'DOWNSTREAM_NOT_FOUND'));
  });

  it('blocks when an alarm belongs to a product other than the declared one', async () => {
    const census = [
      sendCensus(),
      { ...interopCensus(), alarms: [{ id: 'a2', name: 'second-alarm' }] },
    ] as unknown as ReadonlyArray<ProductCensus>;

    const report = await checkRunbookCoverage({
      registry: registryOf([registration('rb', 'SEND', [ALARM, 'second-alarm'], runbookOf({}, {}))]),
      products: PRODUCTS,
      census,
      ignoreReasons: [],
    });

    assert.ok(report.errors.some((issue) => issue.code === 'ALARM_PRODUCT_MISMATCH'));
  });

  it('blocks when the same alarm belongs to multiple Watchtower products', async () => {
    const census = [
      sendCensus(),
      { ...interopCensus(), alarms: [{ id: 'a2', name: ALARM }] },
    ] as unknown as ReadonlyArray<ProductCensus>;

    const report = await checkRunbookCoverage({
      registry: registryOf([registration('rb', 'SEND', [ALARM], runbookOf({}, {}))]),
      products: PRODUCTS,
      census,
      ignoreReasons: [],
    });

    assert.ok(report.errors.some((issue) => issue.code === 'ALARM_PRODUCT_AMBIGUOUS'));
  });

  it('blocks an ignore reason that is not censused', async () => {
    const report = await run({
      analysis: { analysisType: 'IGNORABLE', ignoreReasonCode: 'GHOST' },
      ignoreReasons: [ignoreReason('EXTERNAL', null)],
    });

    assert.ok(report.errors.some((issue) => issue.code === 'IGNORE_REASON_NOT_FOUND'));
  });

  it('blocks static ignoreDetails that do not satisfy the census schema', async () => {
    const report = await run({
      analysis: { analysisType: 'IGNORABLE', ignoreReasonCode: 'RELEASE', ignoreDetails: {} },
      ignoreReasons: [ignoreReason('RELEASE', releaseSchema())],
    });

    const error = report.errors.find((issue) => issue.code === 'IGNORE_DETAILS_INVALID');
    assert.ok(error);
    assert.match(error.message, /version/);
  });

  it('accepts ignoreDetails carrying the applicative x-ui keyword of the seeds', async () => {
    const report = await run({
      analysis: {
        analysisType: 'IGNORABLE',
        ignoreReasonCode: 'MAINTENANCE',
        ignoreDetails: { activity: 'Patching notturno' },
      },
      ignoreReasons: [ignoreReason('MAINTENANCE', maintenanceSchemaWithXui())],
    });

    assert.deepStrictEqual(report.errors, []);
  });

  it('blocks a detailsSchema that does not compile', async () => {
    const report = await run({
      analysis: { analysisType: 'IGNORABLE', ignoreReasonCode: 'BROKEN', ignoreDetails: {} },
      ignoreReasons: [ignoreReason('BROKEN', { type: 'not-a-json-type' })],
    });

    assert.ok(report.errors.some((issue) => issue.code === 'IGNORE_DETAILS_SCHEMA_INVALID'));
  });

  it('keeps unused catalog drift as a warning', async () => {
    const report = await run({ analysis: {} });

    assert.deepStrictEqual(report.errors, []);
    assert.ok(report.warnings.some((issue) => issue.code === 'CATALOG_VALUE_NOT_CENSUSED'));
    assert.ok(report.warnings.some((issue) => issue.code === 'CENSUS_VALUE_NOT_CATALOGUED'));
  });

  it('warns about a documental runbook that is not censused', async () => {
    const report = await run({ analysis: {}, defaults: { runbookName: 'Runbook fantasma' } });

    assert.deepStrictEqual(report.errors, []);
    assert.ok(report.warnings.some((issue) => issue.code === 'RUNBOOK_DOCUMENT_NOT_FOUND'));
  });

  it('warns about a censused name longer than the API bound', async () => {
    const census = [
      { ...sendCensus(), downstreams: [{ id: 'd9', name: 'x'.repeat(300) }] },
      interopCensus(),
    ] as unknown as ReadonlyArray<ProductCensus>;

    const report = await checkRunbookCoverage({
      registry: registryOf([registration('rb', 'SEND', [ALARM], runbookOf({}, {}))]),
      products: PRODUCTS,
      census,
      ignoreReasons: [],
    });

    assert.ok(report.warnings.some((issue) => issue.code === 'CENSUS_NAME_TOO_LONG'));
  });

  it('blocks a completely swapped SEND and INTEROP alarm mapping', async () => {
    const report = await checkRunbookCoverage({
      registry: registryOf([
        registration('send-runbook', 'SEND', [INTEROP_ALARM], runbookOf({}, {})),
        registration('interop-runbook', 'INTEROP', [ALARM], runbookOf({}, {})),
      ]),
      products: PRODUCTS,
      census: [sendCensus(), interopCensus()] as unknown as ReadonlyArray<ProductCensus>,
      ignoreReasons: [],
    });

    assert.strictEqual(
      report.errors.filter((issue) => issue.code === 'ALARM_PRODUCT_MISMATCH').length,
      2,
    );
  });

  it('blocks when a required Watchtower product is missing', async () => {
    const report = await checkRunbookCoverage({
      registry: registryOf([registration('rb', 'SEND', [ALARM], runbookOf({}, {}))]),
      products: [product(SEND_PRODUCT_ID, 'SEND')],
      census: [sendCensus()] as unknown as ReadonlyArray<ProductCensus>,
      ignoreReasons: [],
    });

    const error = report.errors.find((issue) => issue.code === 'PRODUCT_NOT_FOUND');
    assert.ok(error);
    assert.strictEqual(error.product, 'INTEROP');
  });

  it('blocks when two runbook products map to the same Watchtower product id', async () => {
    const sharedProductId = 'shared-product';
    const census = [
      { ...sendCensus(), productId: sharedProductId },
    ] as unknown as ReadonlyArray<ProductCensus>;

    const report = await checkRunbookCoverage({
      registry: registryOf([registration('rb', 'SEND', [ALARM], runbookOf({}, {}))]),
      products: [product(sharedProductId, 'SEND'), product(sharedProductId, 'INTEROP')],
      census,
      ignoreReasons: [],
    });

    const error = report.errors.find((issue) => issue.code === 'PRODUCT_MAPPING_CONFLICT');
    assert.ok(error);
    assert.strictEqual(error.product, 'INTEROP');
  });

  it('blocks when a Watchtower product exists but its census is missing', async () => {
    const report = await checkRunbookCoverage({
      registry: registryOf([registration('rb', 'SEND', [ALARM], runbookOf({}, {}))]),
      products: PRODUCTS,
      census: [sendCensus()] as unknown as ReadonlyArray<ProductCensus>,
      ignoreReasons: [],
    });

    const error = report.errors.find((issue) => issue.code === 'PRODUCT_CENSUS_MISSING');
    assert.ok(error);
    assert.strictEqual(error.product, 'INTEROP');
  });
});

// ─── fixtures ─────────────────────────────────────────────────────────────────

interface RunOptions {
  readonly analysis: Partial<KnownCaseAnalysis>;
  readonly defaults?: RunbookAnalysisDefaults;
  readonly alarmNames?: ReadonlyArray<string>;
  readonly ignoreReasons?: ReadonlyArray<IgnoreReasonDto>;
}

async function run(options: RunOptions): ReturnType<typeof checkRunbookCoverage> {
  const alarmNames = options.alarmNames ?? [ALARM];
  return await checkRunbookCoverage({
    registry: registryOf([
      registration(
        'rb',
        'SEND',
        alarmNames,
        runbookOf(options.defaults ?? {}, options.analysis),
      ),
    ]),
    products: PRODUCTS,
    census: [sendCensus(), interopCensus()] as unknown as ReadonlyArray<ProductCensus>,
    ignoreReasons: options.ignoreReasons ?? [],
  });
}

function registryOf(registrations: ReadonlyArray<AutomaticRunbookRegistration>): AutomaticRunbookRegistry {
  return new AutomaticRunbookRegistry(registrations);
}

function registration(
  key: string,
  product: 'SEND' | 'INTEROP',
  alarmNames: ReadonlyArray<string>,
  runbook: Runbook,
): AutomaticRunbookRegistration {
  return {
    key,
    product,
    alarmNames: alarmNames as readonly [string, ...string[]],
    kind: 'APIGW',
    categories: ['DELIVERY'],
    build: () => ({ ...runbook, metadata: { ...runbook.metadata, id: key } }),
  };
}

function runbookOf(defaults: RunbookAnalysisDefaults, analysis: Partial<KnownCaseAnalysis>): Runbook {
  return {
    metadata: {
      id: 'rb',
      name: 'Test runbook',
      description: 'fixture',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: [],
    },
    steps: [],
    knownCases: [knownCase(analysis)],
    fallbackAction: { type: 'log', level: 'info', title: 'fallback' },
    cloudExecutionPolicy: { sideEffects: 'NONE' },
    analysisDefaults: defaults,
  };
}

function knownCase(analysis: Partial<KnownCaseAnalysis>): KnownCase {
  return {
    id: 'primary',
    description: 'primary',
    priority: 100,
    condition: { type: 'contains', ref: 'steps.query', regex: 'boom' },
    action: { type: 'log', level: 'info', renderAs: 'known-case', title: 'primary' },
    analysis: {
      resolution: 'Chiusura - caso noto.',
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      ...analysis,
    },
  };
}

function product(id: string, name: string): ProductDto {
  return {
    id,
    name,
    description: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

/** Census deliberately missing 'Konecta' so the catalog drift path is exercised. */
function sendCensus(): Record<string, unknown> {
  return {
    productId: SEND_PRODUCT_ID,
    alarms: [{ id: 'a1', name: ALARM }],
    resources: [{ id: 'r1', name: 'pn-delivery', type: { id: 't1', name: 'Service' } }],
    downstreams: [
      { id: 'd1', name: SEND_DOWNSTREAMS.APP_IO },
      { id: 'd2', name: INTEROP_DOWNSTREAMS.SELFCARE },
    ],
    finalActions: [{ id: 'f1', name: 'Nessuna azione' }],
    runbooks: [{ id: 'rb1', name: 'Runbook censito' }],
  };
}

function interopCensus(): Record<string, unknown> {
  return {
    productId: INTEROP_PRODUCT_ID,
    alarms: [{ id: 'a2', name: INTEROP_ALARM }],
    resources: [],
    downstreams: [],
    finalActions: [],
    runbooks: [],
  };
}

function ignoreReason(code: string, detailsSchema: unknown): IgnoreReasonDto {
  return { code, label: code, description: null, sortOrder: 0, detailsSchema } as unknown as IgnoreReasonDto;
}

function releaseSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: { version: { type: 'string', minLength: 1 } },
    required: ['version'],
  };
}

function maintenanceSchemaWithXui(): Record<string, unknown> {
  return {
    type: 'object',
    properties: { activity: { type: 'string', 'x-ui': 'textarea', minLength: 1 } },
    required: ['activity'],
  };
}
