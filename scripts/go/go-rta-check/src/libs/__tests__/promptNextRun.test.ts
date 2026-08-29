import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Core } from '@go-automation/go-common';

import { promptNextRun } from '../promptNextRun.js';

type Choices = ReadonlyArray<Core.GOPromptSelectOption>;

interface Harness {
  readonly script: Core.GOScript;
  readonly titles: string[][];
}

/** Script whose select prompt returns `answer` and records the options offered. */
function harness(answer: unknown): Harness {
  const titles: string[][] = [];
  const script = {
    logger: { info: (): void => undefined, warning: (): void => undefined },
    prompt: {
      select: async (_message: string, choices: Choices): Promise<unknown> => {
        titles.push(choices.map((choice) => choice.title));
        return Promise.resolve(answer);
      },
    },
  } as unknown as Core.GOScript;
  return { script, titles };
}

describe('promptNextRun', () => {
  it('offers another runbook of the same product, another product and the exit', async () => {
    const { script, titles } = harness('SAME_PRODUCT');

    const choice = await promptNextRun({ script, productName: 'SEND', canChangeProduct: true });

    assert.strictEqual(choice, 'SAME_PRODUCT');
    assert.deepStrictEqual(titles[0], [
      'Analizza un altro runbook di SEND',
      'Analizza un runbook di un altro prodotto',
      'Esci',
    ]);
  });

  it('hides the product change when the product was not chosen by the user', async () => {
    const { script, titles } = harness('SAME_PRODUCT');

    await promptNextRun({ script, productName: 'INTEROP', canChangeProduct: false });

    assert.deepStrictEqual(titles[0], ['Analizza un altro runbook di INTEROP', 'Esci']);
  });

  it('returns the chosen continuation', async () => {
    const { script } = harness('CHANGE_PRODUCT');

    const choice = await promptNextRun({ script, productName: 'SEND', canChangeProduct: true });

    assert.strictEqual(choice, 'CHANGE_PRODUCT');
  });

  it('reads an aborted prompt as the end of the session', async () => {
    const { script } = harness(undefined);

    const choice = await promptNextRun({ script, productName: 'SEND', canChangeProduct: true });

    assert.strictEqual(choice, 'EXIT');
  });
});
