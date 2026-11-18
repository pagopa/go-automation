import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GOScript } from '@go-automation/go-script';

import { shouldExecute } from '../shouldExecute.js';

interface Harness {
  readonly script: GOScript;
  readonly messages: ReadonlyArray<string>;
  readonly confirmed: ReadonlyArray<string>;
}

function harness(answer?: boolean): Harness {
  const messages: string[] = [];
  const confirmed: string[] = [];
  const record = (message: string): void => {
    messages.push(message);
  };

  const script = {
    logger: { info: record, error: record, success: record, section: record, warning: record },
    prompt: {
      confirm: async (message: string): Promise<boolean | undefined> => {
        confirmed.push(message);
        return Promise.resolve(answer);
      },
    },
  } as unknown as GOScript;

  return { script, messages, confirmed };
}

describe('shouldExecute', () => {
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly answer: boolean;
    readonly dryRun?: boolean;
    readonly totalEvents?: number;
    readonly allowPrompt?: boolean;
    readonly expected: boolean;
    /** Text of the message explaining the stop, when the run stops. */
    readonly reason?: string;
    readonly asksConfirmation: boolean;
  }> = [
    {
      name: 'stops when the period holds no occurrence',
      answer: true,
      totalEvents: 0,
      expected: false,
      reason: 'Nessuna occorrenza',
      asksConfirmation: false,
    },
    {
      name: 'stops on --dry-run, without asking for a confirmation',
      answer: true,
      dryRun: true,
      expected: false,
      reason: 'Dry-run',
      asksConfirmation: false,
    },
    {
      name: 'stops when the confirmation is declined',
      answer: false,
      expected: false,
      reason: 'annullata',
      asksConfirmation: true,
    },
    { name: 'proceeds once the confirmation is accepted', answer: true, expected: true, asksConfirmation: true },
    {
      name: 'proceeds without prompting when prompts are not allowed',
      answer: false,
      allowPrompt: false,
      expected: true,
      asksConfirmation: false,
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, async () => {
      const { script, messages, confirmed } = harness(testCase.answer);

      const proceed = await shouldExecute({
        script,
        config: testCase.dryRun === true ? { dryRun: true } : {},
        totalEvents: testCase.totalEvents ?? 12,
        occurrences: 5,
        allowPrompt: testCase.allowPrompt ?? true,
      });

      assert.strictEqual(proceed, testCase.expected);
      const { reason } = testCase;
      if (reason !== undefined) assert.ok(messages.some((message) => message.includes(reason)));
      assert.deepStrictEqual(confirmed, testCase.asksConfirmation ? ['Eseguo il runbook su 5 occorrenze?'] : []);
    });
  }
});
