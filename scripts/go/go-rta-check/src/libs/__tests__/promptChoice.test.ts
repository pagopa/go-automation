import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Core } from '@go-automation/go-common';

import { BACK_CHOICE, promptChoice } from '../promptChoice.js';

/** Above 12 options `promptChoice` swaps the plain list for the searchable prompt. */
const LONG_MENU_SIZE = 20;

interface AskedPrompt {
  readonly kind: string;
  readonly message: string;
  readonly titles: ReadonlyArray<string>;
  readonly options?: Core.GOPromptAutocompleteOptions;
}

interface Harness {
  readonly script: Core.GOScript;
  readonly asked: AskedPrompt[];
  readonly warnings: string[];
}

function menu(size: number, withBack: boolean): Core.GOPromptSelectOption[] {
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
      choices: ReadonlyArray<Core.GOPromptSelectOption>,
      options?: Core.GOPromptAutocompleteOptions,
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
  } as unknown as Core.GOScript;

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
  describe('choosing the prompt', () => {
    it('uses the plain list for a short menu without a way back', async () => {
      const { script, asked } = harness('runbook-0');

      await promptChoice<string>(script, 'Seleziona', menu(3, false));

      assert.strictEqual(onlyPrompt(asked).kind, 'select');
    });

    it('uses the list with the shortcut for a short menu offering a way back', async () => {
      const { script, asked } = harness('runbook-0');

      await promptChoice<string>(script, 'Seleziona', menu(3, true));

      const prompt = onlyPrompt(asked);
      assert.strictEqual(prompt.kind, 'selectWithBack');
      assert.ok(prompt.titles.includes('← Indietro · premi ←'));
    });

    it('uses the searchable prompt with the shortcut for a long menu offering a way back', async () => {
      const { script, asked } = harness('runbook-0');

      await promptChoice<string>(script, 'Seleziona', menu(LONG_MENU_SIZE, true));

      const prompt = onlyPrompt(asked);
      assert.strictEqual(prompt.kind, 'autocompleteWithBack');
      assert.ok(prompt.titles.includes('← Indietro · premi ← a filtro vuoto'));
    });

    it('uses the plain searchable prompt for a long menu without a way back', async () => {
      const { script, asked } = harness('runbook-0');

      await promptChoice<string>(script, 'Seleziona', menu(LONG_MENU_SIZE, false));

      const prompt = onlyPrompt(asked);
      assert.strictEqual(prompt.kind, 'autocomplete');
      assert.ok(!prompt.titles.some((title) => title.includes('premi ←')));
    });
  });

  describe('answering', () => {
    it('reports the shortcut of the searchable prompt as the entry it stands for', async () => {
      const { script } = harness(Core.GO_PROMPT_BACK);

      const answer = await promptChoice<string>(script, 'Seleziona', menu(LONG_MENU_SIZE, true));

      assert.strictEqual(answer, BACK_CHOICE);
    });

    it('reports the shortcut of the plain list as the entry it stands for', async () => {
      const { script } = harness(Core.GO_PROMPT_BACK);

      const answer = await promptChoice<string>(script, 'Seleziona', menu(3, true));

      assert.strictEqual(answer, BACK_CHOICE);
    });

    it('warns only when the user drops the prompt', async () => {
      const { script, warnings } = harness(undefined);

      const answer = await promptChoice<string>(script, 'Seleziona', menu(3, true));

      assert.strictEqual(answer, undefined);
      assert.deepStrictEqual(warnings, ['Selezione annullata.']);
    });
  });

  describe('filtering the searchable prompt', () => {
    it('keeps the way back reachable while the filter hides everything else', async () => {
      const { script, asked } = harness('runbook-0');

      await promptChoice<string>(script, 'Seleziona', menu(LONG_MENU_SIZE, true));

      const suggest = onlyPrompt(asked).options?.suggest;
      assert.ok(suggest !== undefined);
      const filtered = await suggest('nothing-matches', menu(LONG_MENU_SIZE, true));

      assert.deepStrictEqual(
        filtered.map((choice) => choice.value),
        [BACK_CHOICE],
      );
    });

    it('matches titles regardless of case', async () => {
      const { script, asked } = harness('runbook-0');

      await promptChoice<string>(script, 'Seleziona', menu(LONG_MENU_SIZE, false));

      const suggest = onlyPrompt(asked).options?.suggest;
      assert.ok(suggest !== undefined);
      const filtered = await suggest('RUNBOOK-1', menu(LONG_MENU_SIZE, false));

      assert.deepStrictEqual(
        filtered.map((choice) => choice.value),
        [
          'runbook-1',
          'runbook-10',
          'runbook-11',
          'runbook-12',
          'runbook-13',
          'runbook-14',
          'runbook-15',
          'runbook-16',
          'runbook-17',
          'runbook-18',
          'runbook-19',
        ],
      );
    });
  });
});
