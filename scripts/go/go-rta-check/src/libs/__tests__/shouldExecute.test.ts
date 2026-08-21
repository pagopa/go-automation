import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Core } from '@go-automation/go-common';

import { shouldExecute } from '../shouldExecute.js';

interface Harness {
  readonly script: Core.GOScript;
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
  } as unknown as Core.GOScript;

  return { script, messages, confirmed };
}

describe('shouldExecute', () => {
  it('stops when the period holds no occurrence', async () => {
    const { script, messages, confirmed } = harness(true);

    const proceed = await shouldExecute({
      script,
      config: {},
      totalEvents: 0,
      occurrences: 0,
      allowPrompt: true,
    });

    assert.strictEqual(proceed, false);
    assert.ok(messages.some((message) => message.includes('Nessuna occorrenza')));
    assert.deepStrictEqual(confirmed, []);
  });

  it('stops on --dry-run, without asking for a confirmation', async () => {
    const { script, messages, confirmed } = harness(true);

    const proceed = await shouldExecute({
      script,
      config: { dryRun: true },
      totalEvents: 12,
      occurrences: 12,
      allowPrompt: true,
    });

    assert.strictEqual(proceed, false);
    assert.ok(messages.some((message) => message.includes('Dry-run')));
    assert.deepStrictEqual(confirmed, []);
  });

  it('stops when the confirmation is declined', async () => {
    const { script, messages, confirmed } = harness(false);

    const proceed = await shouldExecute({
      script,
      config: {},
      totalEvents: 12,
      occurrences: 5,
      allowPrompt: true,
    });

    assert.strictEqual(proceed, false);
    assert.ok(messages.some((message) => message.includes('annullata')));
    assert.strictEqual(confirmed.length, 1);
    assert.match(confirmed[0] ?? '', /5 occorrenze/u);
  });

  it('proceeds once the confirmation is accepted', async () => {
    const { script } = harness(true);

    const proceed = await shouldExecute({
      script,
      config: {},
      totalEvents: 12,
      occurrences: 12,
      allowPrompt: true,
    });

    assert.strictEqual(proceed, true);
  });

  it('proceeds without prompting when prompts are not allowed', async () => {
    const { script, confirmed } = harness(false);

    const proceed = await shouldExecute({
      script,
      config: {},
      totalEvents: 12,
      occurrences: 12,
      allowPrompt: false,
    });

    assert.strictEqual(proceed, true);
    assert.deepStrictEqual(confirmed, []);
  });

  it('keeps --dry-run winning over an accepted confirmation', async () => {
    const { script, confirmed } = harness(true);

    const proceed = await shouldExecute({
      script,
      config: { dryRun: true },
      totalEvents: 12,
      occurrences: 12,
      allowPrompt: false,
    });

    assert.strictEqual(proceed, false);
    assert.deepStrictEqual(confirmed, []);
  });
});
