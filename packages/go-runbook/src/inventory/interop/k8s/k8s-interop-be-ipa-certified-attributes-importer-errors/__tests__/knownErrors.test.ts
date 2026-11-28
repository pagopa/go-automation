import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { InteropPodLogScenario } from '../../../shared/__tests__/helpers/InteropPodLogScenario.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../shared/__tests__/helpers/runbookExecution.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';
import { IPA_IMPORTER_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

// Real production lines of the importer pod.
const SOCKET_HANG_UP =
  '2026-11-26T08:17:29.316Z ERROR [ipa-certified-attributes-importer] - [CID=39ad86ac-be27-4eeb-bb65-fc97c9a1a0c8] socket hang up';
const UPSERT_404 =
  '2026-11-26T08:14:17.774Z ERROR [ipa-certified-attributes-importer] - [CID=73e20d86-ae76-4f29-b937-83c6a070f885] Failed upsert of tenant 09Q0MK8F with attributes [290d1371af230243db2c12eaaaa465ffd1457f06c91d8a14b7c5bca8d4e29bdf, L33, 09Q0MK8F]. status 404, code 005-0001, detail Attribute IPA/09Q0MK8F not found';
const CONFLICT_409 =
  '2026-11-10T07:35:38.560Z ERROR [ipa-certified-attributes-importer] - [CID=bfe7d83e-329e-4e22-a40f-922b35ec75c8] Request failed with status code 409';
const ATTRIBUTE_EXISTS =
  'WARN [attribute-registry-process] - [CID=bfe7d83e-329e-4e22-a40f-922b35ec75c8] - title: Duplicate attribute name or code - detail: An attribute with name ISTITUTO COMPRENSIVO 2 or code 09Q0MK8F and origin IPA already exists - errors: 003-0002';
const DUPLICATE_KEY =
  'ERROR - Error creating event: error: duplicate key value violates unique constraint "events_stream_id_version_key"';

async function run(
  environment: string,
  scenario: Omit<InteropPodLogScenario, 'podApp'>,
): Promise<RunbookLogsExecution> {
  return executeAlarmWithLogs(
    buildRunbook(),
    `${alarm.runbookKey}-${environment}`,
    interopPodResponder({ podApp: alarm.podApp, ...scenario }),
  );
}

describe('IPA certified attributes importer known errors', () => {
  it('recognizes the documented importer messages in every environment', async () => {
    for (const environment of ['prod', 'att', 'test']) {
      for (const [message, expected] of [
        [SOCKET_HANG_UP, 'INTEROP_K8S_K8IBICAIE_IPA-IMP-SOC-HAN-UP'],
        [UPSERT_404, 'INTEROP_K8S_K8IBICAIE_IPA-IMP-TEN-UPS-ATT-NOT-FOU-404'],
        [
          'ERROR [ipa-certified-attributes-importer] - Token verification failed: TokenExpiredError: jwt expired',
          'INTEROP_K8S_K8IBICAIE_IPA-IMP-TOK-EXP-401',
        ],
      ] as const) {
        assert.deepStrictEqual((await run(environment, { messages: [message] })).matchedIds, [expected], message);
      }
    }
  });

  it('recognizes the 409 of an existing attribute only with the 003-0002 answer traced by CID', async () => {
    const traced = await run('prod', {
      messages: [CONFLICT_409],
      cid: 'bfe7d83e-329e-4e22-a40f-922b35ec75c8',
      trackerMessages: [ATTRIBUTE_EXISTS],
    });
    assert.deepStrictEqual(traced.matchedIds, ['INTEROP_K8S_K8IBICAIE_IPA-IMP-ATT-ALR-EXI-409']);
    assert.deepStrictEqual((await run('prod', { messages: [CONFLICT_409] })).matchedIds, []);
  });

  it('recognizes the cases traced in the correlated services', async () => {
    for (const [message, expected] of [
      [DUPLICATE_KEY, 'INTEROP_K8S_K8IBICAIE_IPA-IMP-PUR-EVE-DUP-KEY'],
      [
        'WARN [tenant-process] - title: Conflict - detail: Certified attribute already assigned',
        'INTEROP_K8S_K8IBICAIE_IPA-IMP-CER-ATT-ALR-ASS',
      ],
    ] as const) {
      const { matchedIds } = await run('prod', {
        messages: ['ERROR - Request failed'],
        cid: 'ipa-cid',
        trackerMessages: [message],
      });
      assert.deepStrictEqual(matchedIds, [expected], message);
    }
  });

  it('leaves undocumented importer errors unclassified', async () => {
    for (const message of [
      'ERROR [ipa-certified-attributes-importer] - [CID=0f761431-ad59-4e17-8140-0b2cfaef337d] Client network socket disconnected before secure TLS connection was established',
      UPSERT_404.replace('status 404', 'status 500'),
    ]) {
      assert.deepStrictEqual((await run('prod', { messages: [message] })).matchedIds, [], message);
    }
  });
});
