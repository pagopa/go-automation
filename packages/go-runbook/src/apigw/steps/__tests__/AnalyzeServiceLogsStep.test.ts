import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';

import { analyzeServiceLogs } from '../AnalyzeServiceLogsStep.js';
import { KnownUrlsRegistry } from '../../registries/KnownUrlsRegistry.js';

function row(message: string, level: string = 'ERROR'): ResultField[] {
  const fields: ResultField[] = [{ field: '@message', value: message }];
  if (level !== '') fields.push({ field: 'level', value: level });
  return fields;
}

function createContext(args: {
  readonly stepOutput: ReadonlyArray<ResultField[]>;
  readonly vars?: Record<string, string>;
}): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map<string, unknown>([['query', args.stepOutput]]),
    vars: new Map(Object.entries(args.vars ?? {})),
    params: new Map(),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

describe('analyzeServiceLogs', () => {
  const registry = new KnownUrlsRegistry([{ url: 'https://api.io.pagopa.it/api/v1/activations/', target: 'AppIO' }]);

  it('writes NextUrl + NextUrlTarget when a known URL is found in the logs', async () => {
    const step = analyzeServiceLogs({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      varPrefix: 'svc',
      registry,
    });

    const result = await step.execute(
      createContext({
        stepOutput: [row('ERROR calling https://api.io.pagopa.it/api/v1/activations/foo')],
      }),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars?.['svcNextUrl'], 'https://api.io.pagopa.it/api/v1/activations/foo');
    assert.strictEqual(result.vars?.['svcNextUrlTarget'], 'AppIO');
  });

  it('marks FallbackUuidFresh=true when a known URL and a new UUID appear', async () => {
    const step = analyzeServiceLogs({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      varPrefix: 'svc',
      registry,
    });

    const result = await step.execute(
      createContext({
        stepOutput: [
          row(
            'error calling https://api.io.pagopa.it/api/v1/activations/foo ' +
              'FALLBACK-UUID:11111111-2222-3333-4444-555555555555',
          ),
        ],
      }),
    );

    assert.strictEqual(result.vars?.['svcFallbackUuidFresh'], 'true');
    assert.strictEqual(result.vars?.['fallbackUuid'], '11111111-2222-3333-4444-555555555555');
  });

  it('does not extract a fallback UUID when no known destination URL is found', async () => {
    const step = analyzeServiceLogs({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      varPrefix: 'svc',
      registry,
    });

    const result = await step.execute(
      createContext({
        stepOutput: [row('FALLBACK-UUID:11111111-2222-3333-4444-555555555555 without downstream URL')],
      }),
    );

    assert.strictEqual(result.vars?.['svcFallbackUuidFresh'], 'false');
    assert.strictEqual(result.vars?.['fallbackUuid'], undefined);
    assert.strictEqual(result.output?.fallbackUuidExtracted, undefined);
  });

  it('marks FallbackUuidFresh=false when the UUID matches the existing one', async () => {
    const step = analyzeServiceLogs({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      varPrefix: 'svc',
      registry,
    });

    const result = await step.execute(
      createContext({
        stepOutput: [
          row(
            'retrying https://api.io.pagopa.it/api/v1/activations/foo ' +
              'FALLBACK-UUID:11111111-2222-3333-4444-555555555555',
          ),
        ],
        vars: { fallbackUuid: '11111111-2222-3333-4444-555555555555' },
      }),
    );

    assert.strictEqual(result.vars?.['svcFallbackUuidFresh'], 'false');
    assert.strictEqual(result.vars?.['fallbackUuid'], undefined);
  });

  it('always signals next=resolve so absence-matching known cases get a chance to fire', async () => {
    const step = analyzeServiceLogs({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      varPrefix: 'svc',
      registry,
    });

    const errorRow = await step.execute(createContext({ stepOutput: [row('FAILURE - something exploded')] }));
    assert.strictEqual(errorRow.next, 'resolve');

    const infoRow = await step.execute(createContext({ stepOutput: [row('healthy ping', 'INFO')] }));
    assert.strictEqual(infoRow.next, 'resolve');

    const emptyRows = await step.execute(createContext({ stepOutput: [] }));
    // Empty result set also resolves: absence-matching cases (e.g.
    // `LogCount == '0'`) need their chance.
    assert.strictEqual(emptyRows.next, 'resolve');
  });

  it('records an internal KnownUrl but still resolves first so known cases can run', async () => {
    const internalRegistry = new KnownUrlsRegistry([
      { url: 'http://internal-EcsA-123:8080/ext-registry-private/', target: 'pn-external-registries' },
    ]);
    const step = analyzeServiceLogs({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      varPrefix: 'svc',
      registry: internalRegistry,
      serviceName: 'pn-user-attributes',
      servicesInRunbook: new Set(['pn-user-attributes', 'pn-external-registries']),
    });

    const result = await step.execute(
      createContext({
        stepOutput: [row('error upserting http://internal-EcsA-123:8080/ext-registry-private/io/v1/activations')],
        vars: { xRayTraceId: '1-abc' },
      }),
    );

    assert.strictEqual(result.next, 'resolve');
    assert.strictEqual(result.vars?.['svcNextUrlTarget'], 'pn-external-registries');
    assert.strictEqual(result.vars?.['apiGwVisitedKeys'], undefined);
  });

  it('does not perform loop decisions during analysis', async () => {
    const internalRegistry = new KnownUrlsRegistry([
      { url: 'http://internal-EcsA-123:8080/ext-registry-private/', target: 'pn-external-registries' },
    ]);
    const step = analyzeServiceLogs({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      varPrefix: 'svc',
      registry: internalRegistry,
      serviceName: 'pn-user-attributes',
      servicesInRunbook: new Set(['pn-user-attributes', 'pn-external-registries']),
    });

    const result = await step.execute(
      createContext({
        stepOutput: [row('error upserting http://internal-EcsA-123:8080/ext-registry-private/io/v1/activations')],
        vars: { xRayTraceId: '1-abc', apiGwVisitedKeys: 'pn-external-registries|1-abc|' },
      }),
    );

    assert.strictEqual(result.next, 'resolve');
    assert.strictEqual(result.vars?.['svcNextUrlTarget'], 'pn-external-registries');
  });

  it('does not drill down when a KnownUrl points to the current service', async () => {
    const selfRegistry = new KnownUrlsRegistry([
      { url: 'https://api.pdv.pagopa.it/user-registry/', target: 'pn-data-vault' },
    ]);
    const step = analyzeServiceLogs({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      varPrefix: 'dataVault',
      registry: selfRegistry,
      serviceName: 'pn-data-vault',
      servicesInRunbook: new Set(['pn-data-vault']),
    });

    const result = await step.execute(
      createContext({
        stepOutput: [row('failed call https://api.pdv.pagopa.it/user-registry/v1/users/abc')],
        vars: { xRayTraceId: '1-abc', fallbackUuid: 'fb-1' },
      }),
    );

    assert.strictEqual(result.next, 'resolve');
    assert.strictEqual(result.vars?.['dataVaultNextUrlTarget'], 'pn-data-vault');
    assert.strictEqual(result.vars?.['apiGwVisitedKeys'], undefined);
  });

  it('records a fresh trace_id when fallback-uuid was used', async () => {
    const step = analyzeServiceLogs({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      varPrefix: 'svc',
      registry: new KnownUrlsRegistry([]),
      serviceName: 'pn-user-attributes',
      servicesInRunbook: new Set(['pn-user-attributes']),
    });

    const traceIdRow: ResultField[] = [
      { field: '@message', value: 'application log line' },
      { field: 'level', value: 'ERROR' },
      { field: 'trace_id', value: '3d472be72977635208a92722b97b5e24' },
    ];

    const result = await step.execute(
      createContext({
        stepOutput: [traceIdRow],
        vars: { xRayTraceId: '1-69b158e8-28c211881e5339480367ede0', fallbackUuid: 'fb-uuid-1' },
      }),
    );

    assert.strictEqual(result.next, 'resolve');
    assert.strictEqual(result.vars?.['svcFreshTraceId'], '1-3d472be7-2977635208a92722b97b5e24');
    assert.strictEqual(result.vars?.['svcFreshTraceIdRaw'], '3d472be72977635208a92722b97b5e24');
    assert.strictEqual(result.vars?.['xRayTraceId'], undefined);
  });

  it('does NOT swap when no fallback-uuid is in context yet', async () => {
    const step = analyzeServiceLogs({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      varPrefix: 'svc',
      registry: new KnownUrlsRegistry([]),
      serviceName: 'pn-user-attributes',
      servicesInRunbook: new Set(['pn-user-attributes']),
    });

    const traceIdRow: ResultField[] = [
      { field: '@message', value: 'application log line' },
      { field: 'level', value: 'ERROR' },
      { field: 'trace_id', value: '3d472be72977635208a92722b97b5e24' },
    ];

    const result = await step.execute(
      createContext({
        stepOutput: [traceIdRow],
        vars: { xRayTraceId: '1-69b158e8-28c211881e5339480367ede0' },
      }),
    );

    assert.strictEqual(result.next, 'resolve');
    assert.strictEqual(result.vars?.['xRayTraceId'], undefined);
    assert.strictEqual(result.vars?.['svcFreshTraceId'], '');
  });

  it('does NOT swap when the trace_id matches the current xRayTraceId (raw or canonical)', async () => {
    const step = analyzeServiceLogs({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      varPrefix: 'svc',
      registry: new KnownUrlsRegistry([]),
      serviceName: 'pn-user-attributes',
      servicesInRunbook: new Set(['pn-user-attributes']),
    });

    const traceIdRow: ResultField[] = [
      { field: '@message', value: 'application log line' },
      { field: 'level', value: 'ERROR' },
      { field: 'trace_id', value: '69b158e828c211881e5339480367ede0' },
    ];

    const result = await step.execute(
      createContext({
        stepOutput: [traceIdRow],
        vars: { xRayTraceId: '1-69b158e8-28c211881e5339480367ede0', fallbackUuid: 'fb-1' },
      }),
    );

    assert.strictEqual(result.next, 'resolve');
    assert.strictEqual(result.vars?.['xRayTraceId'], undefined);
    assert.strictEqual(result.vars?.['svcFreshTraceId'], '');
  });

  it('does not apply trace swap limits during analysis', async () => {
    const step = analyzeServiceLogs({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      varPrefix: 'svc',
      registry: new KnownUrlsRegistry([]),
      serviceName: 'pn-user-attributes',
      servicesInRunbook: new Set(['pn-user-attributes']),
    });

    const traceIdRow: ResultField[] = [
      { field: '@message', value: 'application log line' },
      { field: 'level', value: 'ERROR' },
      { field: 'trace_id', value: '3d472be72977635208a92722b97b5e24' },
    ];

    const result = await step.execute(
      createContext({
        stepOutput: [traceIdRow],
        vars: {
          xRayTraceId: '1-69b158e8-28c211881e5339480367ede0',
          fallbackUuid: 'fb-1',
          apiGwTraceIdSwapCount: '5',
        },
      }),
    );

    assert.strictEqual(result.next, 'resolve');
    assert.strictEqual(result.vars?.['svcFreshTraceId'], '1-3d472be7-2977635208a92722b97b5e24');
  });

  it('returns empty vars when the upstream query produced no rows', async () => {
    const step = analyzeServiceLogs({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      varPrefix: 'svc',
      registry,
    });

    const result = await step.execute(createContext({ stepOutput: [] }));
    assert.strictEqual(result.vars?.['svcLogCount'], '0');
    assert.strictEqual(result.vars?.['svcNextUrl'], '');
    assert.strictEqual(result.vars?.['svcNextUrlTarget'], '');
  });
});
