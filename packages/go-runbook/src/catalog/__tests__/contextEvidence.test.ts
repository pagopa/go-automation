import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOLogger } from '@go-automation/go-common/core';
import { createTestServiceRegistry } from '../../registry/createTestServiceRegistry.js';
import { RUNBOOK_CATALOG } from '../RunbookCatalog.js';
import { executeRunbookForOccurrence } from '../executeRunbookForOccurrence.js';

const CONTEXT_RUNBOOKS = [
  'k8s-interop-be-delegation-outbound-writer-errors',
  'k8s-interop-be-delegation-items-archiver-errors',
  'k8s-interop-public-catalog-strapi-errors',
  'k8s-interop-be-catalog-platformstate-writer-errors',
  'k8s-interop-be-purpose-outbound-writer-errors',
  'k8s-interop-be-scheduled-notification-scheduler-errors',
];

describe('INTEROP context evidence contract', () => {
  for (const key of CONTEXT_RUNBOOKS) {
    it(`exports the complete context of ${key} through the cloud occurrence`, async () => {
      const registered = RUNBOOK_CATALOG.resolveByKey(key);
      assert.ok(registered);
      const alarmName = registered.descriptor.alarmNames.find((name) => name.includes('-prod'));
      assert.ok(alarmName);
      const runbook = registered.build();
      const contextIndex = runbook.steps.findIndex(({ evidence }) =>
        evidence?.some(({ retention }) => retention.mode === 'all'),
      );
      const analysisIndex = runbook.steps.findIndex(({ step }) => step.id === 'analyze-interop-cid-tracker');
      assert.ok(contextIndex >= 0 && contextIndex < analysisIndex);
      const contextStep = runbook.steps[contextIndex];
      assert.ok(contextStep);
      const messages = Array.from({ length: 8 }, (_, index) => `INFO context ${String(index)}`);
      const queries: string[] = [];
      const output = await executeRunbookForOccurrence(
        {
          logger: new GOLogger(),
          services: createTestServiceRegistry({
            cloudWatchLogs: {
              // eslint-disable-next-line @typescript-eslint/require-await
              async queryWithStatistics(_groups: ReadonlyArray<string>, query: string) {
                queries.push(query);
                const rows = query.includes('| limit 1000')
                  ? messages.map((message, index) => [
                      { field: '@timestamp', value: `2026-10-06T18:00:0${String(index)}Z` },
                      { field: 'log', value: message },
                      { field: '@message', value: JSON.stringify({ log: message }) },
                      { field: '@logStream', value: 'pod-1' },
                    ])
                  : [];
                return {
                  rows,
                  statistics: { recordsMatched: rows.length, recordsScanned: rows.length, bytesScanned: 1 },
                  queryExecutions: [],
                };
              },
            },
          }),
        },
        {
          alarmName,
          firedAt: '2026-10-06T18:00:08Z',
          awsAccountId: '111111111111',
          region: 'eu-south-1',
          awsProfiles: [],
          executionMode: 'cloud',
        },
      );
      assert.strictEqual(output.execution.status, 'completed');
      const evidence = output.context.evidence.find(({ sourceStep }) => sourceStep === contextStep.step.id);
      assert.ok(evidence);
      assert.deepStrictEqual(
        evidence.items?.map(({ message }) => message),
        messages,
      );
      assert.strictEqual(evidence.truncated, false);
      assert.ok(
        evidence.items?.every((item) => item['@logStream'] === 'pod-1' && item['@message']?.includes('INFO context')),
      );
      assert.strictEqual(queries.length, 2, 'output composition must not execute extra AWS queries');
    });
  }
});
