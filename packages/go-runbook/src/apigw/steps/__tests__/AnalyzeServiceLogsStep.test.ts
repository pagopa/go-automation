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

  it('marks FallbackUuidFresh=true the first time a UUID appears', async () => {
    const step = analyzeServiceLogs({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      varPrefix: 'svc',
      registry,
    });

    const result = await step.execute(
      createContext({
        stepOutput: [row('FALLBACK-UUID:11111111-2222-3333-4444-555555555555 something happened')],
      }),
    );

    assert.strictEqual(result.vars?.['svcFallbackUuidFresh'], 'true');
    assert.strictEqual(result.vars?.['fallbackUuid'], '11111111-2222-3333-4444-555555555555');
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
        stepOutput: [row('FALLBACK-UUID:11111111-2222-3333-4444-555555555555 same as before')],
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

  it('emits goTo (drill-down) when an internal KnownUrl is detected, bypassing case eval', async () => {
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

    assert.deepStrictEqual(result.next, { goTo: 'query-pn-external-registries' });
    assert.match(result.vars?.['apiGwVisitedKeys'] ?? '', /pn-user-attributes\|1-abc\|/);
  });

  it('falls back to resolve when the drill-down target was already visited (loop)', async () => {
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
