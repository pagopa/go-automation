import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GO_PROMPT_BACK,
  type GOPromptAutocompleteOptions,
  type GOPromptSelectOption,
  type GOScript,
} from '@go-automation/go-script';

import { BACK_CHOICE, promptChoice } from '../promptChoice.js';

/** Above 12 options `promptChoice` swaps the plain list for the searchable prompt. */
const LONG_MENU_SIZE = 20;

interface AskedPrompt {
  readonly kind: string;
  readonly message: string;
  readonly titles: ReadonlyArray<string>;
  readonly options?: GOPromptAutocompleteOptions;
}

interface Harness {
  readonly script: GOScript;
  readonly asked: AskedPrompt[];
  readonly warnings: string[];
}

function menu(size: number, withBack: boolean): GOPromptSelectOption[] {
  const entries = Array.from({ length: size }, (_, index) => ({
    title: `runbook-${String(index)}`,
    value: `runbook-${String(index)}`,
  }));
  return withBack ? [...entries, { title: '← Indietro', value: BACK_CHOICE }] : entries;
}

function harness(answer: unknown): Harness {
  const asked: AskedPrompt[] = [];
  const warnings: string[] = [];

  const record =
    (kind: string) =>
    async (
      message: string,
      choices: ReadonlyArray<GOPromptSelectOption>,
      options?: GOPromptAutocompleteOptions,
    ): Promise<unknown> => {
      asked.push({
        kind,
        message,
        titles: choices.map((choice) => choice.title),
        ...(options !== undefined ? { options } : {}),
      });
      return await Promise.resolve(answer);
    };

  const script = {
    logger: {
      warning: (message: string): void => {
        warnings.push(message);
      },
    },
    prompt: {
      select: record('select'),
      selectWithBack: record('selectWithBack'),
      autocomplete: record('autocomplete'),
      autocompleteWithBack: record('autocompleteWithBack'),
    },
  } as unknown as GOScript;

  return { script, asked, warnings };
}

/** Fails the test unless a prompt was asked, and narrows it. */
function onlyPrompt(asked: ReadonlyArray<AskedPrompt>): AskedPrompt {
  assert.strictEqual(asked.length, 1);
  const prompt = asked[0];
  assert.ok(prompt !== undefined);
  return prompt;
}

describe('promptChoice', () => {
  const promptCases: ReadonlyArray<{
    readonly menu: string;
    readonly size: number;
    readonly withBack: boolean;
    readonly kind: string;
    readonly backTitle?: string;
  }> = [
    { menu: 'a short menu without a way back', size: 3, withBack: false, kind: 'select' },
    {
      menu: 'a short menu offering a way back',
      size: 3,
      withBack: true,
      kind: 'selectWithBack',
      backTitle: '← Indietro · premi ←',
    },
    { menu: 'a long menu without a way back', size: LONG_MENU_SIZE, withBack: false, kind: 'autocomplete' },
    {
      menu: 'a long menu offering a way back',
      size: LONG_MENU_SIZE,
      withBack: true,
      kind: 'autocompleteWithBack',
      backTitle: '← Indietro · premi ← a filtro vuoto',
    },
  ];

  for (const { menu: name, size, withBack, kind, backTitle } of promptCases) {
    it(`uses the ${kind} prompt for ${name}, announcing the shortcut only with a way back`, async () => {
      const { script, asked } = harness('runbook-0');

      await promptChoice<string>(script, 'Seleziona', menu(size, withBack));

      const prompt = onlyPrompt(asked);
      assert.strictEqual(prompt.kind, kind);
      if (backTitle === undefined) assert.ok(!prompt.titles.some((title) => title.includes('premi ←')));
      else assert.ok(prompt.titles.includes(backTitle));
    });
  }

  for (const size of [3, LONG_MENU_SIZE]) {
    it(`reports the ← shortcut as the entry it stands for (${String(size)} options)`, async () => {
      const answer = await promptChoice<string>(harness(GO_PROMPT_BACK).script, 'Seleziona', menu(size, true));

      assert.strictEqual(answer, BACK_CHOICE);
    });
  }

  it('warns only when the user drops the prompt', async () => {
    const { script, warnings } = harness(undefined);

    const answer = await promptChoice<string>(script, 'Seleziona', menu(3, true));

    assert.strictEqual(answer, undefined);
    assert.deepStrictEqual(warnings, ['Selezione annullata.']);
  });

  describe('filtering the searchable prompt', () => {
    /** Runs the searchable prompt and filters its options with `input`. */
    async function suggestFor(input: string, withBack: boolean): Promise<ReadonlyArray<unknown>> {
      const { script, asked } = harness('runbook-0');
      await promptChoice<string>(script, 'Seleziona', menu(LONG_MENU_SIZE, withBack));
      const suggest = onlyPrompt(asked).options?.suggest;
      assert.ok(suggest !== undefined);
      const filtered = await suggest(input, menu(LONG_MENU_SIZE, withBack));
      return filtered.map((choice) => choice.value);
    }

    it('keeps the way back reachable while the filter hides everything else', async () => {
      assert.deepStrictEqual(await suggestFor('nothing-matches', true), [BACK_CHOICE]);
    });

    it('matches titles regardless of case', async () => {
      assert.deepStrictEqual(await suggestFor('RUNBOOK-1', false), [
        'runbook-1',
        ...Array.from({ length: 10 }, (_, index) => `runbook-1${String(index)}`),
      ]);
    });
  });
});
