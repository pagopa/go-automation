import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { KnownCase, Runbook } from '@pagopa/go-runbook';
import type { KnownCaseAnalysis } from '@pagopa/go-runbook/output';
import type { RunbookAnalysisDefaults } from '@pagopa/go-runbook/toolkits/common';
import { INTEROP_DOWNSTREAMS } from '@pagopa/go-runbook/toolkits/interop';
import { SEND_DOWNSTREAMS } from '@pagopa/go-runbook/toolkits/send';
import { RunbookCatalog } from '@pagopa/go-runbook/inventory';
import type { RunbookRegistration } from '@pagopa/go-runbook/inventory';
import type { IgnoreReasonDto, ProductCensus, ProductDto } from '@go-automation/go-watchtower-client';

import { checkRunbookCoverage } from '../checkRunbookCoverage.js';

const SEND_PRODUCT_ID = 'product-send';
const INTEROP_PRODUCT_ID = 'product-interop';
const ALARM = 'pn-delivery-B2B-ApiGwAlarm';
const INTEROP_ALARM = 'interop-alarm';

const PRODUCTS: ReadonlyArray<ProductDto> = [product(SEND_PRODUCT_ID, 'SEND'), product(INTEROP_PRODUCT_ID, 'INTEROP')];

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

  it('suggests the censused value on a case-only or type mismatch without accepting it', async () => {
    const cases = [
      // The gate stays case-sensitive.
      [{ finalActions: ['nessuna azione'] }, 'FINAL_ACTION_NOT_FOUND', 'Nessuna azione'],
      [{ resources: [{ name: 'pn-delivery', type: 'Lambda' }] }, 'RESOURCE_TYPE_MISMATCH', 'Service'],
    ] as const;

    for (const [analysis, code, suggestedValue] of cases) {
      const error = (await run({ analysis })).errors.find((issue) => issue.code === code);
      assert.ok(error, code);
      assert.strictEqual(error.suggestedValue, suggestedValue);
    }
  });

  it('only warns about an alarm that no product censuses, still checking the references of the others', async () => {
    const uncensused = await run({ alarmNames: ['unknown-alarm'] });
    assert.deepStrictEqual(uncensused.errors, []);
    assert.ok(uncensused.warnings.some((issue) => issue.code === 'ALARM_NOT_CENSUSED'));

    // The product stays resolvable from the censused alarms, so the references are still checked.
    const partial = await run({
      analysis: { downstreams: [SEND_DOWNSTREAMS.KONECTA] },
      alarmNames: [ALARM, 'unknown-alarm'],
    });
    assert.ok(partial.warnings.some((issue) => issue.code === 'ALARM_NOT_CENSUSED'));
    assert.ok(partial.errors.some((issue) => issue.code === 'DOWNSTREAM_NOT_FOUND'));
  });

  it('blocks an alarm mapped to the wrong product or to several products', async () => {
    const cases: ReadonlyArray<readonly [string, RunOptions]> = [
      [
        'ALARM_PRODUCT_MISMATCH',
        {
          registrations: [registration('rb', 'SEND', [ALARM, 'second-alarm'], runbookOf({}, {}))],
          census: [sendCensus(), { ...interopCensus(), alarms: [{ id: 'a2', name: 'second-alarm' }] }],
        },
      ],
      [
        'ALARM_PRODUCT_AMBIGUOUS',
        { census: [sendCensus(), { ...interopCensus(), alarms: [{ id: 'a2', name: ALARM }] }] },
      ],
    ];

    for (const [code, options] of cases) {
      assert.ok((await run(options)).errors.some((issue) => issue.code === code), code);
    }
  });

  it('blocks a completely swapped SEND and INTEROP alarm mapping', async () => {
    const report = await run({
      registrations: [
        registration('send-runbook', 'SEND', [INTEROP_ALARM], runbookOf({}, {})),
        registration('interop-runbook', 'INTEROP', [ALARM], runbookOf({}, {})),
      ],
    });

    assert.strictEqual(report.errors.filter((issue) => issue.code === 'ALARM_PRODUCT_MISMATCH').length, 2);
  });

  it('blocks an ignore reason that is not censused or whose details schema does not compile', async () => {
    const cases: ReadonlyArray<readonly [string, RunOptions]> = [
      [
        'IGNORE_REASON_NOT_FOUND',
        {
          analysis: { analysisType: 'IGNORABLE', ignoreReasonCode: 'GHOST' },
          ignoreReasons: [ignoreReason('EXTERNAL', null)],
        },
      ],
      [
        'IGNORE_DETAILS_SCHEMA_INVALID',
        {
          analysis: { analysisType: 'IGNORABLE', ignoreReasonCode: 'BROKEN', ignoreDetails: {} },
          ignoreReasons: [ignoreReason('BROKEN', { type: 'not-a-json-type' })],
        },
      ],
    ];

    for (const [code, options] of cases) {
      assert.ok((await run(options)).errors.some((issue) => issue.code === code), code);
    }
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

  it('keeps catalog drift, uncensused documental runbooks and over-long census names as warnings', async () => {
    const cases: ReadonlyArray<readonly [ReadonlyArray<string>, RunOptions]> = [
      [['CATALOG_VALUE_NOT_CENSUSED', 'CENSUS_VALUE_NOT_CATALOGUED'], {}],
      [['RUNBOOK_DOCUMENT_NOT_FOUND'], { defaults: { runbookName: 'Runbook fantasma' } }],
      [
        ['CENSUS_NAME_TOO_LONG'],
        { census: [{ ...sendCensus(), downstreams: [{ id: 'd9', name: 'x'.repeat(300) }] }, interopCensus()] },
      ],
    ];

    for (const [codes, options] of cases) {
      const report = await run(options);
      assert.deepStrictEqual(report.errors, [], codes.join());
      for (const code of codes) {
        assert.ok(report.warnings.some((issue) => issue.code === code), code);
      }
    }
  });

  it('blocks a missing, shared or uncensused Watchtower product', async () => {
    const sharedProductId = 'shared-product';
    const cases: ReadonlyArray<readonly [string, RunOptions]> = [
      ['PRODUCT_NOT_FOUND', { products: [product(SEND_PRODUCT_ID, 'SEND')], census: [sendCensus()] }],
      [
        'PRODUCT_MAPPING_CONFLICT',
        {
          products: [product(sharedProductId, 'SEND'), product(sharedProductId, 'INTEROP')],
          census: [{ ...sendCensus(), productId: sharedProductId }],
        },
      ],
      ['PRODUCT_CENSUS_MISSING', { census: [sendCensus()] }],
    ];

    for (const [code, options] of cases) {
      const error = (await run(options)).errors.find((issue) => issue.code === code);
      assert.ok(error, code);
      assert.strictEqual(error.product, 'INTEROP');
    }
  });
});

// ─── fixtures ─────────────────────────────────────────────────────────────────

interface RunOptions {
  readonly analysis?: Partial<KnownCaseAnalysis>;
  readonly defaults?: RunbookAnalysisDefaults;
  readonly alarmNames?: ReadonlyArray<string>;
  readonly ignoreReasons?: ReadonlyArray<IgnoreReasonDto>;
  /** Replaces the single SEND runbook built from the options above. */
  readonly registrations?: ReadonlyArray<RunbookRegistration>;
  readonly products?: ReadonlyArray<ProductDto>;
  readonly census?: ReadonlyArray<Record<string, unknown>>;
}

/** Checks one SEND runbook (or `registrations`) against the SEND and INTEROP census. */
async function run(options: RunOptions = {}): ReturnType<typeof checkRunbookCoverage> {
  const registrations = options.registrations ?? [
    registration('rb', 'SEND', options.alarmNames ?? [ALARM], runbookOf(options.defaults ?? {}, options.analysis ?? {})),
  ];
  return await checkRunbookCoverage({
    registry: registryOf(registrations),
    products: options.products ?? PRODUCTS,
    census: (options.census ?? [sendCensus(), interopCensus()]) as unknown as ReadonlyArray<ProductCensus>,
    ignoreReasons: options.ignoreReasons ?? [],
  });
}

function registryOf(registrations: ReadonlyArray<RunbookRegistration>): RunbookCatalog {
  return new RunbookCatalog(registrations, {
    downstreamCatalogs: {
      SEND: new Set<string>(Object.values(SEND_DOWNSTREAMS)),
      INTEROP: new Set<string>(Object.values(INTEROP_DOWNSTREAMS)),
    },
  });
}

function registration(
  key: string,
  product: 'SEND' | 'INTEROP',
  alarmNames: ReadonlyArray<string>,
  runbook: Runbook,
): RunbookRegistration {
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
