import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { KnownCase, RunbookContext } from '../../../engine/index.js';
import type { RunbookBuilderFn } from '../../../toolkits/common/index.js';
import type { InteropK8sAlarm } from '../../../toolkits/interop/index.js';
import { ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM } from '../k8s/k8s-interop-be-attribute-registry-readmodel-writer-sql-errors/alarmDefinition.js';
import { KNOWN_CASES as ATTRIBUTE_REGISTRY_CASES } from '../k8s/k8s-interop-be-attribute-registry-readmodel-writer-sql-errors/knownCases.js';
import { buildRunbook as buildAttributeRegistryRunbook } from '../k8s/k8s-interop-be-attribute-registry-readmodel-writer-sql-errors/runbook.js';
import { CATALOG_READMODEL_WRITER_SQL_ALARM } from '../k8s/k8s-interop-be-catalog-readmodel-writer-sql-errors/alarmDefinition.js';
import { KNOWN_CASES as CATALOG_CASES } from '../k8s/k8s-interop-be-catalog-readmodel-writer-sql-errors/knownCases.js';
import { buildRunbook as buildCatalogRunbook } from '../k8s/k8s-interop-be-catalog-readmodel-writer-sql-errors/runbook.js';
import { matchingCaseIds } from '../../../__tests__/helpers/knownCaseMatching.js';
import { cidTrackerOutput, conditionContext, podLogRows } from './helpers/knownCaseTesting.js';
import { executeAlarmWithLogs, interopPodResponder } from './helpers/runbookExecution.js';

const NETWORK_MESSAGES: ReadonlyArray<string> = [
  'ERROR - Connection timeout',
  // The documented variant has two spaces after the dash.
  'ERROR -  Connection error: Client network socket disconnected before secure TLS connection was established',
];
const KAFKA_MESSAGE =
  'The coordinator is not aware of this member, re-joining the group - The coordinator is not aware of this member';

/** The two SQL readmodel writers documented with the same network and Kafka cases. */
const WRITERS: ReadonlyArray<{
  readonly alarm: InteropK8sAlarm;
  readonly knownCases: ReadonlyArray<KnownCase>;
  readonly buildRunbook: RunbookBuilderFn;
  readonly casePrefix: string;
}> = [
  {
    alarm: ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM,
    knownCases: ATTRIBUTE_REGISTRY_CASES,
    buildRunbook: buildAttributeRegistryRunbook,
    casePrefix: 'attribute-registry',
  },
  {
    alarm: CATALOG_READMODEL_WRITER_SQL_ALARM,
    knownCases: CATALOG_CASES,
    buildRunbook: buildCatalogRunbook,
    casePrefix: 'catalog-readmodel-writer',
  },
];

for (const { alarm, knownCases, buildRunbook, casePrefix } of WRITERS) {
  const network = `${casePrefix}-temporary-network-errors`;
  const kafka = `${casePrefix}-kafka-coordinator-member-rejoin`;
  const documented: ReadonlyArray<readonly [string, string]> = [
    ...NETWORK_MESSAGES.map((message) => [message, network] as const),
    [KAFKA_MESSAGE, kafka],
  ];
  const applicationContext = (messages: ReadonlyArray<string>, environment = 'prod'): RunbookContext =>
    conditionContext([[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, messages)]], environment);

  describe(`${alarm.runbookKey} known cases`, () => {
    it('recognizes every documented message in prod writer evidence only', () => {
      for (const [message, expected] of documented) {
        assert.deepStrictEqual(matchingCaseIds(knownCases, applicationContext([message])), [expected], message);
        for (const environment of ['att', 'test']) {
          assert.deepStrictEqual(matchingCaseIds(knownCases, applicationContext([message], environment)), []);
        }
        const tracker = cidTrackerOutput(podLogRows(alarm.podApp, [message]));
        assert.deepStrictEqual(
          matchingCaseIds(knownCases, conditionContext([[alarm.stepIds.queryCidTracker, tracker]])),
          [],
        );
      }
    });

    it('does not broaden the cases to undocumented network or Kafka errors', () => {
      for (const message of [
        'Request failed: Connection timeout',
        'ERROR - Connection timeouts',
        'ERROR - Connection error: read ECONNRESET',
        'The group coordinator is not available',
        'Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member',
        'The coordinator is not aware of this member, re-joining the group',
        `${KAFKA_MESSAGE}ship`,
      ]) {
        assert.deepStrictEqual(matchingCaseIds(knownCases, applicationContext([message])), [], message);
      }
    });

    it('recognizes the documented messages in an execution, where the writer logs carry a JSON envelope', async () => {
      for (const [message, expected] of documented) {
        const { matchedIds } = await executeAlarmWithLogs(
          buildRunbook(),
          `${alarm.runbookKey}-prod`,
          interopPodResponder({ podApp: alarm.podApp, messages: [message] }),
        );
        assert.deepStrictEqual(matchedIds, [expected], message);
      }
    });
  });
}
