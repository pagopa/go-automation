import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ResultField } from '@go-automation/go-common/aws';

import { ConditionEvaluator } from '../../framework.js';
import type { RunbookContext } from '../../framework.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { ClassifyDelayerAlarmDayStep } from '../ClassifyDelayerAlarmDayStep.js';
import { KNOWN_CASES } from '../knownCases.js';

const FIRST_DOCUMENTED_ERROR =
  'Invalid sender limit percentage [4.221290863369656] for productType: 890, paId: 9a7c1b23-46a3-489b-8ed4-398ffb32b45a, province: RM with totalEstimate: 3579, weeklyEstimate: 15108 Error processing sender limit job for province: RM, tenderId: 20260921, deliveryWeek: 2026-11-02';
const SECOND_DOCUMENTED_ERROR = 'Invalid senderLimit percentage: job will fail without retry';
const THIRD_DOCUMENTED_ERROR = 'No drivers found for province: RM';

function context(message: string, alarmDatetime: string, alarmDatetimeEnd?: string): RunbookContext {
  const row: ReadonlyArray<ResultField> = [{ field: 'message', value: message }];
  return {
    executionId: 'delayer-test',
    startedAt: new Date('2026-09-28T12:00:00.000Z'),
    stepResults: new Map([['query-pn-delayer-sender-limit-job', [row]]]),
    vars: new Map(),
    params: new Map([
      ['alarmDatetime', alarmDatetime],
      ...(alarmDatetimeEnd === undefined ? [] : ([['alarmDatetimeEnd', alarmDatetimeEnd]] as [string, string][])),
    ]),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

describe('pn-delayer sender limit known cases', () => {
  const evaluator = new ConditionEvaluator();

  it('recognizes both documented messages and selects the Monday action in Rome time', async () => {
    const mondayUtcSundayNight = '2026-09-27T22:30:00.000Z';
    for (const message of [FIRST_DOCUMENTED_ERROR, SECOND_DOCUMENTED_ERROR]) {
      const input = context(message, mondayUtcSundayNight);
      const result = await new ClassifyDelayerAlarmDayStep().execute(input);
      assert.strictEqual(result.vars?.['delayerAlarmIncludesMonday'], 'true');
      const ctx = { ...input, vars: new Map(Object.entries(result.vars ?? {})) };
      assert.strictEqual(evaluator.evaluate(KNOWN_CASES[0]!.condition, ctx), true);
      assert.strictEqual(evaluator.evaluate(KNOWN_CASES[1]!.condition, ctx), false);
    }
    assert.strictEqual(KNOWN_CASES[0]?.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.deepStrictEqual(KNOWN_CASES[0]?.analysis?.finalActions, [
      'Avvisare il prodotto',
      'Verificare la presenza dell’allarme pn-BatchWorkflowStateMachine-FailedAlarm',
    ]);
    // La pagina elenca entrambi i thread nella stessa riga di Casi noti.
    assert.strictEqual(KNOWN_CASES[0]?.analysis?.links?.length, 2);
    assert.strictEqual(KNOWN_CASES[1]?.analysis?.links?.length, 2);
  });

  it('classifies missing drivers separately and follows the documented Monday and other-day actions', async () => {
    for (const [alarmDatetime, expectedId, expectedStatus] of [
      ['2026-09-27T22:30:00.000Z', 'no-drivers-monday', 'IN_PROGRESS'],
      ['2026-09-29T10:00:00.000Z', 'no-drivers-other-day', 'COMPLETED'],
    ] as const) {
      const input = context(THIRD_DOCUMENTED_ERROR, alarmDatetime);
      const result = await new ClassifyDelayerAlarmDayStep().execute(input);
      const ctx = { ...input, vars: new Map(Object.entries(result.vars ?? {})) };
      const matches = KNOWN_CASES.filter(({ condition }) => evaluator.evaluate(condition, ctx));
      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0]?.id, expectedId);
      assert.strictEqual(matches[0]?.analysis?.proposedStatus, expectedStatus);
      assert.match(matches[0]?.analysis?.errorDetails ?? '', /Nessun driver/);
      assert.doesNotMatch(matches[0]?.analysis?.errorDetails ?? '', /percentuale|senza retry/i);
      assert.strictEqual(matches[0]?.analysis?.links?.length, 2);
      assert.deepStrictEqual(
        matches[0]?.analysis?.finalActions ?? [],
        expectedStatus === 'IN_PROGRESS'
          ? ['Avvisare il prodotto', 'Verificare la presenza dell’allarme pn-BatchWorkflowStateMachine-FailedAlarm']
          : [],
      );
    }
  });

  it('does not classify an incomplete missing-driver message', async () => {
    const input = context('No drivers found for province: ', '2026-09-29T10:00:00.000Z');
    const result = await new ClassifyDelayerAlarmDayStep().execute(input);
    const ctx = { ...input, vars: new Map(Object.entries(result.vars ?? {})) };
    assert.ok(KNOWN_CASES.every(({ condition }) => !evaluator.evaluate(condition, ctx)));
  });

  it('closes the known case on other days and leaves different errors unmatched', async () => {
    const input = context(SECOND_DOCUMENTED_ERROR, '2026-09-29T10:00:00.000Z');
    const result = await new ClassifyDelayerAlarmDayStep().execute(input);
    assert.strictEqual(result.vars?.['delayerAlarmIncludesMonday'], 'false');
    const ctx = { ...input, vars: new Map(Object.entries(result.vars ?? {})) };
    assert.strictEqual(evaluator.evaluate(KNOWN_CASES[0]!.condition, ctx), false);
    assert.strictEqual(evaluator.evaluate(KNOWN_CASES[1]!.condition, ctx), true);
    assert.strictEqual(KNOWN_CASES[1]?.analysis?.proposedStatus, 'COMPLETED');

    const other = context('ERROR unexpected connection failure', '2026-09-29T10:00:00.000Z');
    const otherCtx = { ...other, vars: ctx.vars };
    assert.ok(KNOWN_CASES.every((knownCase) => !evaluator.evaluate(knownCase.condition, otherCtx)));
  });

  it('requires Monday review when a multi-occurrence interval crosses Monday', async () => {
    const input = context(SECOND_DOCUMENTED_ERROR, '2026-09-27T20:00:00.000Z', '2026-09-28T10:00:00.000Z');
    const result = await new ClassifyDelayerAlarmDayStep().execute(input);
    assert.strictEqual(result.vars?.['delayerAlarmIncludesMonday'], 'true');
  });

  it('rejects missing and inverted occurrence times', async () => {
    const step = new ClassifyDelayerAlarmDayStep();
    const input = context(SECOND_DOCUMENTED_ERROR, '2026-09-29T10:00:00.000Z');
    await assert.rejects(async () => await step.execute({ ...input, params: new Map() }), /invalid alarmDatetime/u);
    await assert.rejects(
      async () =>
        await step.execute(context(SECOND_DOCUMENTED_ERROR, '2026-09-29T10:00:00.000Z', '2026-09-28T10:00:00.000Z')),
      /last occurrence precedes first/u,
    );
  });
});
