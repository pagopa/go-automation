import { SELFCARE_USERS_UPDATER_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { service } from '../../framework.js';
import { GOLogger } from '@go-automation/go-common';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { SELFCARE_USERS_UPDATER_QUERY_PROFILE as PROFILE } from '../queryProfile.js';

import { buildRunbook } from '../runbook.js';

describe('buildRunbook', () => {
  it('builds a SERVICE-compatible read-only runbook with the expected pipeline', () => {
    const runbook = buildRunbook();

    assert.strictEqual(runbook.metadata.id, SELFCARE_USERS_UPDATER_ALARM.runbookKey);
    assert.deepStrictEqual(
      runbook.steps.map((descriptor) => descriptor.step.id),
      [
        SELFCARE_USERS_UPDATER_ALARM.stepIds.resolveContext,
        SELFCARE_USERS_UPDATER_ALARM.stepIds.queryApplicationLogs,
        SELFCARE_USERS_UPDATER_ALARM.stepIds.analyzeApplicationLogs,
        SELFCARE_USERS_UPDATER_ALARM.stepIds.queryCidTracker,
        SELFCARE_USERS_UPDATER_ALARM.stepIds.analyzeCidTracker,
      ],
    );
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 5, afterMinutes: 1 });
    assert.ok(service.isServiceRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.service.name, SELFCARE_USERS_UPDATER_ALARM.podApp);
    assert.deepStrictEqual(runbook.analysisDefaults, {
      runbookName: SELFCARE_USERS_UPDATER_ALARM.runbookKey,
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2129330177/k8s-interop-be-selfcare-client-users-updater-errors',
          name: SELFCARE_USERS_UPDATER_ALARM.runbookKey,
          type: 'CONFLUENCE',
        },
      ],
      resources: [{ name: SELFCARE_USERS_UPDATER_ALARM.podApp, role: 'PRIMARY' }],
    });
  });

  it('queries stderr and the structured application error field for the exact service', () => {
    const query = PROFILE.buildApplicationLogsQuery(SELFCARE_USERS_UPDATER_ALARM.podApp);
    assert.match(query, /filter \(log like \/ERROR\/ or stream = "stderr"\)/u);
    assert.match(query, /pod_app = "interop-be-selfcare-client-users-updater"/u);
    assert.doesNotMatch(query, /@message like \/ERROR\/|pod_app like/u);
    assert.match(query, /sort @timestamp asc/u);
    assert.match(PROFILE.buildCidTrackerQuery('cid-1'), /filter cid = "cid-1"/u);
  });

  it('collects CID context from the resolved environment without diagnosing another service', async () => {
    const runbook = buildRunbook();
    let calls = 0;
    const result = await new RunbookEngine(new GOLogger()).execute(
      runbook,
      new Map([
        ['alarmName', `${SELFCARE_USERS_UPDATER_ALARM.runbookKey}-test`],
        ['startTime', '2026-10-23T01:21:28.000Z'],
        ['endTime', '2026-10-23T01:27:28.000Z'],
      ]),
      createTestServiceRegistry({
        cloudWatchLogs: {
          async queryWithStatistics(groups, query) {
            assert.deepStrictEqual(groups, ['/aws/eks/interop-eks-cluster-test/application']);
            const application = calls++ === 0;
            assert.strictEqual(
              query,
              application
                ? PROFILE.buildApplicationLogsQuery(SELFCARE_USERS_UPDATER_ALARM.podApp)
                : PROFILE.buildCidTrackerQuery('cid-1'),
            );
            return {
              rows: [
                [
                  { field: 'cid', value: 'cid-1' },
                  {
                    field: 'pod_app',
                    value: application ? SELFCARE_USERS_UPDATER_ALARM.podApp : 'interop-be-other-service',
                  },
                  {
                    field: '@message',
                    value: application ? 'Unknown error [CID=cid-1]' : 'Connection error: read ECONNRESET [CID=cid-1]',
                  },
                ],
              ],
              statistics: { recordsMatched: 1 },
              queryExecutions: [],
            };
          },
        },
      }),
    );
    assert.strictEqual(calls, 2);
    assert.strictEqual(result.status, 'completed');
    assert.deepStrictEqual(result.matchedCases, []);
    assert.strictEqual(result.finalContext.vars.get(`${SELFCARE_USERS_UPDATER_ALARM.varPrefix}CidCount`), '1');
    assert.strictEqual(buildAnalysisDraft(runbook, result)?.kind, 'UNKNOWN_CASE_CONTEXT');
  });
});
