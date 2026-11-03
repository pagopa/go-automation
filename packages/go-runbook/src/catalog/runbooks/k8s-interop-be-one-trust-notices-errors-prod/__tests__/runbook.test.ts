import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { INTEROP_DOWNSTREAMS } from '../../framework.js';
import { ONE_TRUST_NOTICES_ALARM as ALARM } from '../alarmDefinition.js';
import { K8S_INTEROP_BE_ONE_TRUST_NOTICES_ERRORS_PROD_REGISTRATION as REGISTRATION } from '../registration.js';
import { buildRunbook } from '../runbook.js';

interface Scenario {
  readonly messages?: ReadonlyArray<string>;
  readonly cid?: string;
  readonly trackerMessages?: ReadonlyArray<string>;
}

interface TestExecution {
  readonly result: RunbookExecutionResult;
  readonly draft: ReturnType<typeof buildAnalysisDraft>;
  readonly queries: ReadonlyArray<string>;
  readonly logGroups: ReadonlyArray<string>;
  readonly resolutionModes: ReadonlyArray<unknown>;
}

async function execute(scenario: Scenario): Promise<TestExecution> {
  const queries: string[] = [];
  const logGroups: string[] = [];
  const resolutionModes: unknown[] = [];
  const cloudWatchLogs = {
    async queryWithStatistics(
      groups: ReadonlyArray<string>,
      query: string,
      _timeRange: unknown,
      options?: { readonly logGroupResolutionMode?: string },
    ): Promise<AWSCloudWatchLogsQueryResult> {
      await Promise.resolve();
      queries.push(query);
      logGroups.push(...groups);
      resolutionModes.push(options?.logGroupResolutionMode);
      const tracker = query.includes('filter cid =');
      const podApp = tracker ? 'interop-be-another-service' : ALARM.podApp;
      const messages = (tracker ? scenario.trackerMessages : scenario.messages) ?? [];
      const rows: ReadonlyArray<ReadonlyArray<ResultField>> = messages.map((message) => [
        { field: 'pod_app', value: podApp },
        {
          field: '@message',
          value: JSON.stringify({
            log: `${scenario.cid === undefined ? '' : `[CID=${scenario.cid}] `}${message}`,
            pod_app: podApp,
            stream: 'stderr',
            pod_namespace: 'prod',
          }),
        },
      ]);
      return {
        rows,
        statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
        queryExecutions: [],
      };
    },
  };
  const runbook = buildRunbook();
  const result = await new RunbookEngine(new GOLogger()).execute(
    runbook,
    new Map([
      ['alarmName', ALARM.runbookKey],
      ['startTime', '2026-10-26T20:57:51.000Z'],
      ['endTime', '2026-10-26T21:07:51.000Z'],
    ]),
    createTestServiceRegistry({ cloudWatchLogs }),
  );
  return { result, draft: buildAnalysisDraft(runbook, result), queries, logGroups, resolutionModes };
}

describe('OneTrust notices production runbook', () => {
  it('registers the production K8s alarm with a cloud executable read-only pipeline', () => {
    assert.strictEqual(REGISTRATION.kind, 'K8S');
    assert.strictEqual(REGISTRATION.product, 'INTEROP');
    assert.deepStrictEqual(REGISTRATION.alarmNames, [ALARM.runbookKey]);
    for (const environment of ['att', 'test', 'dev']) {
      assert.throws(() => ALARM.resolveContext(ALARM.runbookKey.replace(/prod$/u, environment)), /Unsupported/u);
    }
    const runbook = buildRunbook();
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.match(runbook.analysisDefaults?.links?.[0]?.url ?? '', /2389835914/u);
  });

  for (const [status, resolution] of [
    [503, 'PIN-7321'],
    [502, 'Da segnalare solo se'],
    [500, 'PIN-8724'],
  ] as const) {
    it(`recognizes HTTP ${status} without requiring a CID or declaring recovery`, async () => {
      const { result, draft, queries, logGroups, resolutionModes } = await execute({
        messages: [`AxiosError: Request failed with status code ${status}`],
      });
      assert.deepStrictEqual(
        result.matchedCases.map(({ id }) => id),
        [`one-trust-http-${status}`],
      );
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
      assert.deepStrictEqual(draft.downstreams, [INTEROP_DOWNSTREAMS.ONE_TRUST]);
      assert.deepStrictEqual(draft.finalActions, []);
      assert.ok(draft.conclusionNotes?.includes(resolution));
      assert.strictEqual(queries.length, 1);
      assert.match(queries[0] ?? '', /pod_namespace = "prod" and pod_app = "interop-be-one-trust-notices"/u);
      assert.match(queries[0] ?? '', /stream = "stderr"/u);
      assert.deepStrictEqual(logGroups, ['/aws/eks/interop-eks-cluster-prod/application']);
      assert.deepStrictEqual(resolutionModes, ['search-configured-profiles']);
    });
  }

  it('keeps SSL resolution undocumented and its relationship to the alarm open', async () => {
    const { result, draft } = await execute({
      messages: ['Error: There was an error establishing an SSL connection'],
    });
    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['one-trust-ssl-connection'],
    );
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.ok(draft.conclusionNotes?.includes('Risoluzione non documentata.'));
    assert.deepStrictEqual(draft.finalActions, []);
    assert.ok(draft.links.some(({ url }) => url.endsWith('p1791281845977249')));
  });

  it('collects correlated logs without treating a successful line as recovery', async () => {
    const { result, draft, queries } = await execute({
      messages: ['AxiosError: Request failed with status code 502'],
      cid: 'one-trust-cid',
      trackerMessages: ['INFO - Request completed successfully'],
    });
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.strictEqual(queries.length, 2);
    assert.match(queries[1] ?? '', /filter cid = "one-trust-cid"/u);
    assert.strictEqual(result.finalContext.vars.get(`${ALARM.varPrefix}CidCount`), '1');
  });

  it('does not classify another service’s tracker errors as a OneTrust case', async () => {
    const { result, draft } = await execute({
      messages: ['ERROR - Unknown OneTrust error'],
      cid: 'shared-cid',
      trackerMessages: [
        'AxiosError: Request failed with status code 503',
        'AxiosError: Request failed with status code 502',
        'AxiosError: Request failed with status code 500',
        'Error: There was an error establishing an SSL connection',
      ],
    });
    assert.deepStrictEqual(result.matchedCases, []);
    assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
  });

  it('keeps empty evidence, generic connection failures and other statuses unknown', async () => {
    for (const messages of [
      [],
      ['Error: Error while connecting to OneTrust'],
      ['AxiosError: Request failed with status code 504'],
      ['AxiosError: Request failed with status code 5030'],
      ['AccessDenied'],
    ]) {
      const { result, draft } = await execute({ messages });
      assert.deepStrictEqual(result.matchedCases, []);
      assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    }
  });
});
