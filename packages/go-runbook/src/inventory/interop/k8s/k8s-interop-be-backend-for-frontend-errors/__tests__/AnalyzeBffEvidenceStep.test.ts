import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { conditionContext } from '../../../shared/__tests__/helpers/knownCaseTesting.js';
import { AnalyzeBffEvidenceStep } from '../AnalyzeBffEvidenceStep.js';
import { BFF_ALARM } from '../alarmDefinition.js';

describe('AnalyzeBffEvidenceStep', () => {
  it('fails explicitly when application or tracker evidence is unavailable', async () => {
    assert.strictEqual((await new AnalyzeBffEvidenceStep().execute(conditionContext([]))).success, false);
  });

  it('keeps the service and CID from JSON log envelopes and skips malformed or unrelated tracker entries', async () => {
    const context = conditionContext([
      [
        BFF_ALARM.stepIds.queryApplicationLogs,
        [[{ field: '@message', value: JSON.stringify({ pod_app: BFF_ALARM.podApp, log: '[CID=a] Unknown failure' }) }]],
      ],
      [
        BFF_ALARM.stepIds.queryCidTracker,
        [
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
        ],
      ],
    ]);
    const result = await new AnalyzeBffEvidenceStep().execute(context);
    assert.strictEqual(result.success, true);
    assert.ok(result.output !== undefined);
    assert.deepStrictEqual(result.output.bffRows, [
      { podApp: BFF_ALARM.podApp, message: '[CID=a] Unknown failure', cid: 'a' },
    ]);
    assert.deepStrictEqual(result.output.purposeRows, [
      { podApp: 'interop-be-purpose-process', message: 'purpose failure', cid: 'a' },
    ]);
    assert.deepStrictEqual(result.output.expiredNotificationRequests, []);
    assert.deepStrictEqual(result.output.selfcareUsersTimeouts, []);
  });

  it('counts once a BFF row that the CID tracker reads again', async () => {
    const own = [
      { field: '@timestamp', value: '2026-11-20 10:00:00.000' },
      { field: '@message', value: JSON.stringify({ pod_app: BFF_ALARM.podApp, log: '[CID=a] Unknown failure' }) },
    ];
    const result = await new AnalyzeBffEvidenceStep().execute(
      conditionContext([
        [BFF_ALARM.stepIds.queryApplicationLogs, [own]],
        [
          BFF_ALARM.stepIds.queryCidTracker,
          [
            {
              cid: 'a',
              rows: [
                [
                  { field: '@timestamp', value: '2026-11-20 10:00:00.000' },
                  { field: 'pod_app', value: BFF_ALARM.podApp },
                  { field: 'log', value: '[CID=a] Unknown failure' },
                ],
                [
                  { field: '@timestamp', value: '2026-11-20 10:00:01.000' },
                  { field: 'pod_app', value: BFF_ALARM.podApp },
                  { field: 'log', value: '[CID=a] Retry failed' },
                ],
              ],
            },
          ],
        ],
      ]),
    );
    assert.deepStrictEqual(
      result.output?.bffRows.map(({ message }) => message),
      ['[CID=a] Unknown failure', '[CID=a] Retry failed'],
    );
  });
});
