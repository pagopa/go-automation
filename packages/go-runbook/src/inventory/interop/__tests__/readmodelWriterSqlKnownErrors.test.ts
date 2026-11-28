import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { KnownError, RunbookContext } from '../../../engine/index.js';
import type { RunbookBuilderFn } from '../../../toolkits/common/index.js';
import type { InteropK8sAlarm } from '../../../toolkits/interop/index.js';
import { ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM } from '../k8s/k8s-interop-be-attribute-registry-readmodel-writer-sql-errors/alarmDefinition.js';
import { KNOWN_ERRORS as ATTRIBUTE_REGISTRY_CASES } from '../k8s/k8s-interop-be-attribute-registry-readmodel-writer-sql-errors/knownErrors.js';
import { buildRunbook as buildAttributeRegistryRunbook } from '../k8s/k8s-interop-be-attribute-registry-readmodel-writer-sql-errors/runbook.js';
import { CATALOG_READMODEL_WRITER_SQL_ALARM } from '../k8s/k8s-interop-be-catalog-readmodel-writer-sql-errors/alarmDefinition.js';
import { KNOWN_ERRORS as CATALOG_CASES } from '../k8s/k8s-interop-be-catalog-readmodel-writer-sql-errors/knownErrors.js';
import { buildRunbook as buildCatalogRunbook } from '../k8s/k8s-interop-be-catalog-readmodel-writer-sql-errors/runbook.js';
import { matchingKnownErrorCodes } from '../../../__tests__/helpers/knownErrorMatching.js';
import { cidTrackerOutput, conditionContext, podLogRows } from '../shared/__tests__/helpers/knownErrorTesting.js';
import { executeAlarmWithLogs, interopPodResponder } from '../shared/__tests__/helpers/runbookExecution.js';

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
  readonly knownErrors: ReadonlyArray<KnownError>;
  readonly buildRunbook: RunbookBuilderFn;
  readonly networkCode: string;
  readonly kafkaCode: string;
}> = [
  {
    alarm: ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM,
    knownErrors: ATTRIBUTE_REGISTRY_CASES,
    buildRunbook: buildAttributeRegistryRunbook,
    networkCode: 'INTEROP_K8S_K8IBARRWSE_ATT-REG-TEM-NET-ERR',
    kafkaCode: 'INTEROP_K8S_K8IBARRWSE_ATT-REG-KAF-COO-MEM-REJ',
  },
  {
    alarm: CATALOG_READMODEL_WRITER_SQL_ALARM,
    knownErrors: CATALOG_CASES,
    buildRunbook: buildCatalogRunbook,
    networkCode: 'INTEROP_K8S_K8IBCRWSE_CAT-REA-WRI-TEM-NET-ERR',
    kafkaCode: 'INTEROP_K8S_K8IBCRWSE_CAT-REA-WRI-KAF-COO-MEM-REJ',
  },
];

for (const { alarm, knownErrors, buildRunbook, networkCode: network, kafkaCode: kafka } of WRITERS) {
  const documented: ReadonlyArray<readonly [string, string]> = [
    ...NETWORK_MESSAGES.map((message) => [message, network] as const),
    [KAFKA_MESSAGE, kafka],
  ];
  const applicationContext = (messages: ReadonlyArray<string>, environment = 'prod'): RunbookContext =>
    conditionContext([[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, messages)]], environment);

  describe(`${alarm.runbookKey} known errors`, () => {
    it('recognizes every documented message in prod writer evidence only', () => {
      for (const [message, expected] of documented) {
        assert.deepStrictEqual(
          matchingKnownErrorCodes(knownErrors, applicationContext([message])),
          [expected],
          message,
        );
        for (const environment of ['att', 'test']) {
          assert.deepStrictEqual(matchingKnownErrorCodes(knownErrors, applicationContext([message], environment)), []);
        }
        const tracker = cidTrackerOutput(podLogRows(alarm.podApp, [message]));
        assert.deepStrictEqual(
          matchingKnownErrorCodes(knownErrors, conditionContext([[alarm.stepIds.queryCidTracker, tracker]])),
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
        assert.deepStrictEqual(matchingKnownErrorCodes(knownErrors, applicationContext([message])), [], message);
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
