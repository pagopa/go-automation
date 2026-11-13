import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTestServiceRegistry } from '../../../../../common/testing/createTestServiceRegistry.js';
import type { OperationalContext } from '../../../../../common/services/OperationalContext.js';
import type { QueryInteropPodContextConfig } from '../../types/QueryInteropPodContextConfig.js';
import { QueryInteropPodContextStep } from '../QueryInteropPodContextStep.js';

const CONFIG: QueryInteropPodContextConfig = {
  id: 'query-example-context',
  label: 'Contesto del pod',
  contextName: 'Example context',
  countVar: 'exampleContextLogCount',
  completeness: 'row-limit',
  missingContextError: 'missing context',
  incompleteContextError: 'incomplete context',
};

function context(
  vars: ReadonlyArray<readonly [string, string]>,
  queries: string[],
  rows: number,
  recordsMatched = rows,
): OperationalContext {
  return {
    executionId: 'pod-context-test',
    startedAt: new Date('2026-10-06T18:05:00.000Z'),
    stepResults: new Map(),
    vars: new Map(vars),
    params: new Map([
      ['startTime', '2026-10-06T17:30:00Z'],
      ['endTime', '2026-10-06T18:05:00Z'],
    ]),
    logs: [],
    services: createTestServiceRegistry({
      cloudWatchLogs: {
        // eslint-disable-next-line @typescript-eslint/require-await
        async queryWithStatistics(_groups: ReadonlyArray<string>, query: string) {
          queries.push(query);
          return {
            rows: Array.from({ length: rows }, () => [{ field: 'log', value: 'INFO started' }]),
            statistics: { bytesScanned: 1, recordsScanned: recordsMatched, recordsMatched },
            queryExecutions: [],
          };
        },
      },
    }),
    recoveredErrors: [],
  };
}

const RESOLVED = [
  ['interopLogGroup', '/aws/eks/interop/application'],
  ['interopPodApp', 'example"pod'],
  ['interopEnvironment', 'prod'],
] as const;

describe('QueryInteropPodContextStep', () => {
  it('reads every level of the escaped pod and writes the row count', async () => {
    const queries: string[] = [];
    const result = await new QueryInteropPodContextStep(CONFIG).execute(context(RESOLVED, queries, 2));
    assert.equal(result.success, true);
    assert.equal(result.vars?.['exampleContextLogCount'], '2');
    assert.match(queries[0] ?? '', /^\| filter pod_app = "example\\"pod"$/mu);
    assert.doesNotMatch(queries[0] ?? '', /pod_namespace|ERROR/u);
  });

  it('filters the namespace of the resolved environment with the configured suffix', async () => {
    const queries: string[] = [];
    await new QueryInteropPodContextStep({ ...CONFIG, namespaceSuffix: '-ns' }).execute(context(RESOLVED, queries, 1));
    assert.match(queries[0] ?? '', /^\| filter pod_namespace = "prod-ns"$/mu);
  });

  it('fails without the resolved pod, and without the environment when the namespace is filtered', async () => {
    const queries: string[] = [];
    const noPod = await new QueryInteropPodContextStep(CONFIG).execute(context(RESOLVED.slice(0, 1), queries, 1));
    assert.equal(noPod.success, false);
    assert.match(noPod.error ?? '', /missing context/u);
    const noEnvironment = await new QueryInteropPodContextStep({ ...CONFIG, namespaceSuffix: '' }).execute(
      context(RESOLVED.slice(0, 2), queries, 1),
    );
    assert.equal(noEnvironment.success, false);
    assert.deepEqual(queries, []);
  });

  it('applies the configured completeness check', async () => {
    const atLimit = await new QueryInteropPodContextStep(CONFIG).execute(context(RESOLVED, [], 1000));
    assert.match(atLimit.error ?? '', /incomplete context/u);
    const unreturned = context(RESOLVED, [], 3, 5);
    assert.equal((await new QueryInteropPodContextStep(CONFIG).execute(unreturned)).success, true);
    const strict = new QueryInteropPodContextStep({ ...CONFIG, completeness: 'row-limit-or-unreturned-matches' });
    assert.match((await strict.execute(unreturned)).error ?? '', /incomplete context/u);
  });
});
