import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ConditionEvaluator,
  type KnownCase,
  type RunbookContext,
  type ServiceRegistry,
} from '@go-automation/go-runbook';
import type { ResultField } from '@go-automation/go-common/aws';

import { KNOWN_CASES as EXTERNAL_CHANNEL_CASES } from '../workday-pn-external-channel-alb-alarm/knownCases.js';
import { buildWorkdayPnExternalChannelAlbAlarmRunbook } from '../workday-pn-external-channel-alb-alarm/runbook.js';

function ctx(args: { readonly stepResults?: ReadonlyArray<readonly [string, unknown]> }): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-06-09T00:00:00.000Z'),
    stepResults: new Map<string, unknown>(args.stepResults ?? []),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

function knownCaseById(cases: ReadonlyArray<KnownCase>, id: string): KnownCase {
  const knownCase = cases.find((candidate) => candidate.id === id);
  assert.ok(knownCase !== undefined);
  return knownCase;
}

function cwRow(fields: Record<string, string>): ResultField[] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

describe('service runbook known cases', () => {
  const evaluator = new ConditionEvaluator();

  it('matches duplicated external-channel paper progress events', () => {
    const knownCase = knownCaseById(EXTERNAL_CHANNEL_CASES, 'duplicated-event-400-02');

    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        ctx({
          stepResults: [
            [
              'query-pn-external-channel',
              [
                'sendPaperProgressStatusRequest syntax/semantic errors : result code = \'400.02\' : result description = \'Errore di validazione regole semantiche\' : specific errors identified = [DUPLICATED_EVENT] ERR_CONS - {"errorList":[{"error":"[ERR_CONS_DUPLICATED_EVENT]"}]}',
              ],
            ],
          ],
        }),
      ),
      true,
    );
  });

  it('matches ERR_CONS duplicated event logs without the 400.02 text', () => {
    const knownCase = knownCaseById(EXTERNAL_CHANNEL_CASES, 'duplicated-event-err-cons');

    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        ctx({
          stepResults: [
            [
              'query-pn-external-channel',
              [
                cwRow({
                  '@timestamp': '2026-06-01T05:04:13.372Z',
                  level: 'ERROR',
                  '@message':
                    '{"message":"ERR_CONS - {\\"request\\":[{\\"requestId\\":\\"PREPARE_ANALOG_DOMICILE.IUN_VGYH-HDTK-NEWA-202603-W-1\\"}], \\"errorList\\":[{\\"error\\": \\"[ERR_CONS_DUPLICATED_EVENT]\\", \\"description\\": \\"The request has duplicated events\\"}]}","trace_id":"6a1d12cde853a9726be9c7c20da54682"}',
                  trace_id: '6a1d12cde853a9726be9c7c20da54682',
                }),
              ],
            ],
          ],
        }),
      ),
      true,
    );
  });

  it('does not match unrelated external-channel errors', () => {
    const knownCase = knownCaseById(EXTERNAL_CHANNEL_CASES, 'duplicated-event-err-cons');

    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        ctx({
          stepResults: [['query-pn-external-channel', ['sendPaperProgressStatusRequest timeout']]],
        }),
      ),
      false,
    );
  });

  it('builds the workday pn-external-channel runbook without validation errors', () => {
    assert.doesNotThrow(() => buildWorkdayPnExternalChannelAlbAlarmRunbook());
  });
});
