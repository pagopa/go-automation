import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { RunbookBuilderFn } from '../../../toolkits/common/index.js';
import type { InteropK8sAlarm } from '../../../toolkits/interop/index.js';
import { AGREEMENT_READMODEL_WRITER_SQL_ALARM } from '../k8s/k8s-interop-be-agreement-readmodel-writer-sql-errors/alarmDefinition.js';
import { buildRunbook as buildAgreementRunbook } from '../k8s/k8s-interop-be-agreement-readmodel-writer-sql-errors/runbook.js';
import { DELEGATION_READMODEL_WRITER_SQL_ALARM } from '../k8s/k8s-interop-be-delegation-readmodel-writer-sql-errors/alarmDefinition.js';
import { buildRunbook as buildDelegationRunbook } from '../k8s/k8s-interop-be-delegation-readmodel-writer-sql-errors/runbook.js';
import { ESERVICE_TEMPLATE_INSTANCES_UPDATER_ALARM } from '../k8s/k8s-interop-be-eservice-template-instances-updater-errors/alarmDefinition.js';
import { buildRunbook as buildInstancesUpdaterRunbook } from '../k8s/k8s-interop-be-eservice-template-instances-updater-errors/runbook.js';
import { ESERVICE_TEMPLATE_READMODEL_WRITER_SQL_ALARM } from '../k8s/k8s-interop-be-eservice-template-readmodel-writer-sql-errors/alarmDefinition.js';
import { buildRunbook as buildTemplateWriterRunbook } from '../k8s/k8s-interop-be-eservice-template-readmodel-writer-sql-errors/runbook.js';
import { IN_APP_NOTIFICATION_DISPATCHER_ALARM } from '../k8s/k8s-interop-be-in-app-notification-dispatcher-errors/alarmDefinition.js';
import { buildRunbook as buildDispatcherRunbook } from '../k8s/k8s-interop-be-in-app-notification-dispatcher-errors/runbook.js';
import type { RunbookLogsExecution } from '../../../__tests__/helpers/RunbookLogsExecution.js';
import { executeAlarmWithLogs, interopPodResponder } from '../shared/__tests__/helpers/runbookExecution.js';

const REJOIN = 'The coordinator is not aware of this member, re-joining the group';
const REJOIN_WITH_REASON = `${REJOIN} - The coordinator is not aware of this member`;
const HEARTBEAT = 'Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member';

/**
 * Runbooks whose only documented case is a Kafka consumer-group rejoin; they
 * differ in the accepted variants, the environments and the evidence sources.
 */
const SCENARIOS: ReadonlyArray<{
  readonly alarm: InteropK8sAlarm;
  readonly buildRunbook: RunbookBuilderFn;
  readonly caseId: string;
  /** Messages the case recognizes. */
  readonly documented: ReadonlyArray<string>;
  /** Environments where the case is documented. */
  readonly environments: ReadonlyArray<string>;
  /** Whether a rejoin traced by the CID tracker in another service is attributed to the case. */
  readonly tracedInOtherServices: boolean;
  /** Similar messages the case must not recognize. */
  readonly undocumented: ReadonlyArray<string>;
}> = [
  {
    alarm: AGREEMENT_READMODEL_WRITER_SQL_ALARM,
    buildRunbook: buildAgreementRunbook,
    caseId: 'agreement-readmodel-writer-sql-kafka-coordinator-member-rejoin',
    documented: [`ERROR - ${REJOIN}`, `ERROR - ${REJOIN_WITH_REASON}`, `ERROR - ${REJOIN.replace(', ', ',  ')}`],
    environments: ['prod'],
    tracedInOtherServices: false,
    undocumented: [
      `ERROR - ${HEARTBEAT}`,
      'ERROR - The group coordinator is not available',
      'ERROR - Connection error: read ECONNRESET',
      'ERROR - Error writing agreement to SQL',
      `ERROR - ${REJOIN}ed`,
    ],
  },
  {
    alarm: DELEGATION_READMODEL_WRITER_SQL_ALARM,
    buildRunbook: buildDelegationRunbook,
    caseId: 'delegation-readmodel-writer-sql-kafka-coordinator-member-rejoin',
    documented: [`ERROR - ${REJOIN_WITH_REASON}`],
    environments: ['prod', 'att'],
    tracedInOtherServices: false,
    undocumented: [
      'ERROR - The coordinator is not aware of this member',
      'ERROR - The group coordinator is not available',
      'ERROR - Connection error: read ECONNRESET',
      'ERROR - Error writing delegation to SQL',
    ],
  },
  {
    alarm: ESERVICE_TEMPLATE_READMODEL_WRITER_SQL_ALARM,
    buildRunbook: buildTemplateWriterRunbook,
    caseId: 'eservice-template-readmodel-writer-sql-kafka-coordinator-member-rejoin',
    documented: [REJOIN],
    environments: ['prod', 'att', 'test'],
    tracedInOtherServices: true,
    undocumented: [
      'The coordinator is not aware of another member, re-joining the group',
      'The coordinator is not aware of this member',
      'The coordinator is not available, re-joining the group',
    ],
  },
  {
    alarm: IN_APP_NOTIFICATION_DISPATCHER_ALARM,
    buildRunbook: buildDispatcherRunbook,
    caseId: 'in-app-notification-dispatcher-kafka-coordinator-member-rejoin',
    documented: [`ERROR - ${REJOIN_WITH_REASON}`],
    environments: ['prod'],
    tracedInOtherServices: false,
    undocumented: [
      'ERROR - The coordinator is not aware of this member',
      'ERROR - The group coordinator is not available',
      'ERROR - Connection error: read ECONNRESET',
      'ERROR - Unknown notification dispatcher error',
    ],
  },
  {
    alarm: ESERVICE_TEMPLATE_INSTANCES_UPDATER_ALARM,
    buildRunbook: buildInstancesUpdaterRunbook,
    caseId: 'eservice-template-instances-updater-kafka-coordinator-unknown-member',
    documented: [
      `ERROR - ${HEARTBEAT}`,
      `ERROR - ${REJOIN_WITH_REASON}`,
      `ERROR - ${HEARTBEAT.replace('key: 12, version: 3', 'key:  12,  version:  3').replace(') - ', ')  -  ')}`,
      `ERROR - ${REJOIN_WITH_REASON.replace(', ', ',  ')}`,
    ],
    environments: ['prod'],
    tracedInOtherServices: false,
    undocumented: [
      'ERROR - The coordinator is not aware of this member',
      'ERROR - The group coordinator is not available',
      'ERROR - Response OffsetCommit(key: 8, version: 5) - The coordinator is not aware of this member',
      `ERROR - ${HEARTBEAT.replace('version: 3', 'version: 4')}`,
      `ERROR - ${HEARTBEAT.replace('key: 12', 'key: 13')}`,
      `ERROR - ${HEARTBEAT.replace('this member', 'this membership')}`,
      'ERROR - Connection error: read ECONNRESET',
      'ERROR - Error updating template instance',
    ],
  },
];

for (const scenario of SCENARIOS) {
  const { alarm, caseId } = scenario;
  const run = async (
    environment: string,
    messages: ReadonlyArray<string>,
    trackerMessages: ReadonlyArray<string> = [],
  ): Promise<RunbookLogsExecution> =>
    executeAlarmWithLogs(
      scenario.buildRunbook(),
      `${alarm.runbookKey}-${environment}`,
      interopPodResponder({
        podApp: alarm.podApp,
        messages,
        ...(trackerMessages.length === 0 ? {} : { cid: 'traced-cid', trackerMessages }),
      }),
    );

  describe(`${alarm.runbookKey} Kafka rejoin case`, () => {
    it(`recognizes the documented messages without CID only in ${scenario.environments.join(', ')}`, async () => {
      for (const environment of ['prod', 'att', 'test']) {
        const expected = scenario.environments.includes(environment) ? [caseId] : [];
        for (const message of scenario.documented) {
          assert.deepStrictEqual(
            (await run(environment, [message])).matchedIds,
            expected,
            `${environment}: ${message}`,
          );
        }
      }
    });

    it(`${scenario.tracedInOtherServices ? 'attributes' : 'does not attribute'} a rejoin traced in another service`, async () => {
      const { matchedIds, queries } = await run('prod', ['ERROR - Unknown failure'], [scenario.documented[0] ?? '']);
      assert.strictEqual(queries.length, 2);
      assert.deepStrictEqual(matchedIds, scenario.tracedInOtherServices ? [caseId] : []);
    });

    it('does not recognize undocumented Kafka, network or service errors', async () => {
      for (const message of scenario.undocumented) {
        assert.deepStrictEqual((await run('prod', [message])).matchedIds, [], message);
      }
    });
  });
}
