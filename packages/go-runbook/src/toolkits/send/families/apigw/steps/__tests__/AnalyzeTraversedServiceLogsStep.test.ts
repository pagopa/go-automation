import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import { AnalyzeTraversedServiceLogsStep } from '../AnalyzeTraversedServiceLogsStep.js';
import { KnownUrlsRegistry } from '../../../../../common/parsing/knownUrls/KnownUrlsRegistry.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';
import { logRow } from '../../../../../../__tests__/helpers/logRow.js';

const UUID = '11111111-2222-3333-4444-555555555555';
const APP_IO = 'https://api.io.pagopa.it/api/v1/activations/foo';
const REGISTRIES = 'http://internal-EcsA-123:8080/ext-registry-private/io/v1/activations';
const XRAY = '1-69b158e8-28c211881e5339480367ede0';
const REGISTRY = new KnownUrlsRegistry([
  { url: 'https://api.io.pagopa.it/api/v1/activations/', target: 'AppIO' },
  { url: 'http://internal-EcsA-123:8080/ext-registry-private/', target: 'pn-external-registries' },
  { url: 'https://api.pdv.pagopa.it/user-registry/', target: 'pn-user-attributes' },
]);

function error(message: string, level: string = 'ERROR'): GOLogsInsightsResultField[] {
  return logRow({ '@message': message, level });
}

function traced(traceId: string): GOLogsInsightsResultField[] {
  return logRow({ '@message': 'application log line', level: 'ERROR', trace_id: traceId });
}

/** An analysis case: the rows and vars in, the vars (`undefined` = not written) out. */
interface AnalysisCase {
  readonly name: string;
  readonly rows: ReadonlyArray<GOLogsInsightsResultField[]>;
  readonly vars?: Readonly<Record<string, string>>;
  readonly writes: Readonly<Record<string, string | undefined>>;
}

const CASES: ReadonlyArray<AnalysisCase> = [
  {
    name: 'writes NextUrl and NextUrlTarget when a known URL is found',
    rows: [error(`ERROR calling ${APP_IO}`)],
    writes: { svcNextUrl: APP_IO, svcNextUrlTarget: 'AppIO' },
  },
  {
    name: 'records an internal or self target without deciding the traversal',
    rows: [error(`error upserting ${REGISTRIES}`)],
    vars: { xRayTraceId: '1-abc', apiGwVisitedKeys: 'pn-external-registries|1-abc|' },
    writes: { svcNextUrlTarget: 'pn-external-registries', apiGwVisitedKeys: undefined },
  },
  {
    name: 'records a target equal to the analyzed service, leaving the loop decision to the decide step',
    rows: [error('failed call https://api.pdv.pagopa.it/user-registry/v1/users/abc')],
    vars: { xRayTraceId: '1-abc', fallbackUuid: 'fb-1' },
    writes: { svcNextUrlTarget: 'pn-user-attributes', apiGwVisitedKeys: undefined },
  },
  {
    name: 'marks a new fallback UUID found with a known URL as fresh',
    rows: [error(`error calling ${APP_IO} FALLBACK-UUID:${UUID}`)],
    writes: { svcFallbackUuidFresh: 'true', fallbackUuid: UUID },
  },
  {
    name: 'does not mark a fallback UUID equal to the current one as fresh',
    rows: [error(`retrying ${APP_IO} FALLBACK-UUID:${UUID}`)],
    vars: { fallbackUuid: UUID },
    writes: { svcFallbackUuidFresh: 'false', fallbackUuid: undefined },
  },
  {
    name: 'ignores a fallback UUID without a known destination URL',
    rows: [error(`FALLBACK-UUID:${UUID} without downstream URL`)],
    writes: { svcFallbackUuidFresh: 'false', fallbackUuid: undefined },
  },
  {
    name: 'clears an inherited fallback when the selected downstream row has no UUID',
    rows: [error(`FALLBACK-UUID:${UUID} unrelated operation`, 'INFO'), error(`Error calling ${APP_IO}`)],
    vars: { fallbackUuid: UUID, xRayTraceId: '1-original' },
    writes: { fallbackUuid: '', svcFallbackUuidFresh: 'false', xRayTraceId: undefined },
  },
  {
    name: 'keeps the query fallback when no downstream URL is selected',
    rows: [error('Error without a downstream invocation')],
    vars: { fallbackUuid: UUID },
    writes: { fallbackUuid: undefined },
  },
  {
    name: 'records the trace_id of a fallback query without swapping it',
    rows: [traced('3d472be72977635208a92722b97b5e24')],
    vars: { xRayTraceId: XRAY, fallbackUuid: 'fb-1', apiGwTraceIdSwapCount: '5' },
    writes: {
      svcFreshTraceId: '1-3d472be7-2977635208a92722b97b5e24',
      svcFreshTraceIdRaw: '3d472be72977635208a92722b97b5e24',
      xRayTraceId: undefined,
    },
  },
  {
    name: 'records the trace_id even when it matches the current one',
    rows: [traced('69b158e828c211881e5339480367ede0')],
    vars: { xRayTraceId: XRAY, fallbackUuid: 'fb-1' },
    writes: { svcFreshTraceId: XRAY, svcFreshTraceIdRaw: '69b158e828c211881e5339480367ede0' },
  },
  {
    name: 'records no trace_id when no fallback UUID was used',
    rows: [traced('3d472be72977635208a92722b97b5e24')],
    vars: { xRayTraceId: XRAY },
    writes: { svcFreshTraceId: '', xRayTraceId: undefined },
  },
  {
    name: 'resolves on rows without errors too',
    rows: [error('healthy ping', 'INFO')],
    writes: {},
  },
  {
    name: 'writes empty vars on an empty result, still resolving for absence-matching cases',
    rows: [],
    writes: { svcLogCount: '0', svcNextUrl: '', svcNextUrlTarget: '' },
  },
];

describe('AnalyzeTraversedServiceLogsStep', () => {
  const step = new AnalyzeTraversedServiceLogsStep({
    id: 'analyze',
    label: 'Analyze',
    fromStep: 'query',
    varPrefix: 'svc',
    registry: REGISTRY,
    serviceName: 'pn-user-attributes',
  });

  for (const { name, rows, vars, writes } of CASES) {
    it(name, async () => {
      const result = await step.execute(createTestContext({ stepResults: { query: rows }, vars: vars ?? {} }));

      assert.strictEqual(result.success, true);
      // Always resolve, so known cases get a chance before the decide step.
      assert.strictEqual(result.next, 'resolve');
      for (const [key, value] of Object.entries(writes)) assert.strictEqual(result.vars?.[key], value, key);
      if (writes['svcFallbackUuidFresh'] === 'false')
        assert.strictEqual(result.output?.fallbackUuidExtracted, undefined);
    });
  }
});
