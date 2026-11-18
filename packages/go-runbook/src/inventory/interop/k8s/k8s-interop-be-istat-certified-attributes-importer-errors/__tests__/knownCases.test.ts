import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { InteropPodLogScenario } from '../../../shared/__tests__/helpers/InteropPodLogScenario.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../shared/__tests__/helpers/runbookExecution.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';
import { ISTAT_IMPORTER_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

// Real message shapes from the operational runbook and the ticket comments.
const DUPLICATE =
  'Certified Discrete Attribute 91387efa-8661-4ca7-a15e-888baab89bf6 already assigned to tenant 2cc6f822-63a8-418b-bcda-7ea389bf3d28';
const CONFLICT = 'Error on internalAssignDiscreteCertifiedAttribute. Reason: Request failed with status code 409';
const TENANT = 'Certifier tenant ISTAT not found';
const ALREADY_ASSIGNED = 'istat-discrete-certified-attribute-already-assigned';
const TENANT_NOT_FOUND = 'istat-certifier-tenant-not-found';

async function run(
  environment: string,
  scenario: Omit<InteropPodLogScenario, 'podApp'>,
): Promise<RunbookLogsExecution> {
  return executeAlarmWithLogs(
    buildRunbook(),
    `${alarm.runbookKey}-${environment}`,
    interopPodResponder({ podApp: alarm.podApp, trackerPodApp: 'interop-be-tenant-process', ...scenario }),
  );
}

describe('ISTAT certified attributes importer known cases', () => {
  it('recognizes every documented message in every environment without CID', async () => {
    for (const environment of ['prod', 'att', 'test']) {
      for (const [message, expected] of [
        [DUPLICATE, ALREADY_ASSIGNED],
        [CONFLICT, ALREADY_ASSIGNED],
        [TENANT, TENANT_NOT_FOUND],
      ] as const) {
        assert.deepStrictEqual((await run(environment, { messages: [message] })).matchedIds, [expected], message);
      }
    }
  });

  it('follows the CID into correlated services and keeps a missing certifier primary', async () => {
    const traced = await run('prod', { messages: ['Request failed'], cid: 'istat-cid', trackerMessages: [DUPLICATE] });
    assert.deepStrictEqual(traced.matchedIds, [ALREADY_ASSIGNED]);

    const mixed = await run('test', { messages: [CONFLICT], cid: 'istat-cid', trackerMessages: [TENANT] });
    assert.deepStrictEqual(mixed.matchedIds, [TENANT_NOT_FOUND, ALREADY_ASSIGNED]);
  });

  it('does not classify unrelated 409s, failed assignments with another status, or another certifier', async () => {
    for (const message of [
      'Request failed with status code 409',
      CONFLICT.replace('409', '500'),
      CONFLICT.replace('409', '4090'),
      TENANT.replace('ISTAT', 'ANAC'),
    ]) {
      assert.deepStrictEqual((await run('prod', { messages: [message] })).matchedIds, [], message);
    }
  });
});
