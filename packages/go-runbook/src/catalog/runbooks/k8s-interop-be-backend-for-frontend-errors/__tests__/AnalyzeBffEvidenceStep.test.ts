import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AnalyzeBffEvidenceStep } from '../AnalyzeBffEvidenceStep.js';
import { BFF_ALARM } from '../alarmDefinition.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import type { RunbookContext } from '../../../../types/RunbookContext.js';

function context(): RunbookContext & { stepResults: Map<string, unknown> } {
  return {
    executionId: 'evidence-test',
    startedAt: new Date(),
    stepResults: new Map(),
    vars: new Map(),
    params: new Map(),
    logs: [],
    recoveredErrors: [],
    services: createTestServiceRegistry(),
  };
}

describe('AnalyzeBffEvidenceStep', () => {
  it('fails explicitly when application or tracker evidence is unavailable', async () => {
    assert.strictEqual((await new AnalyzeBffEvidenceStep().execute(context())).success, false);
  });

  it('keeps the service and CID from JSON log envelopes and skips malformed or unrelated tracker entries', async () => {
    const ctx = context();
    ctx.stepResults.set(BFF_ALARM.stepIds.queryApplicationLogs, [
      [{ field: '@message', value: JSON.stringify({ pod_app: BFF_ALARM.podApp, log: '[CID=a] Unknown failure' }) }],
    ]);
    ctx.stepResults.set(BFF_ALARM.stepIds.queryCidTracker, [
      null,
      {},
      {
        cid: 'b',
        rows: [
          [
            { field: 'pod_app', value: 'interop-be-purpose-process' },
            { field: 'log', value: 'unrelated' },
          ],
        ],
      },
      { cid: 'a', rows: 'invalid' },
      {
        cid: 'a',
        rows: [
          [
            {
              field: '@message',
              value: JSON.stringify({ pod_app: 'interop-be-purpose-process', log: 'purpose failure' }),
            },
          ],
        ],
      },
    ]);
    const result = await new AnalyzeBffEvidenceStep().execute(ctx);
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output?.bffRows, [
      { podApp: BFF_ALARM.podApp, message: '[CID=a] Unknown failure', cid: 'a' },
    ]);
    assert.deepStrictEqual(result.output?.purposeRows, [
      { podApp: 'interop-be-purpose-process', message: 'purpose failure', cid: 'a' },
    ]);
    assert.deepStrictEqual(result.output?.expiredNotificationRequests, []);
    assert.deepStrictEqual(result.output?.selfcareUsersTimeouts, []);
  });
});
