import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Core } from '@go-automation/go-common';

import { selectTarget } from '../selectTarget.js';
import { BACK_CHOICE } from '../promptChoice.js';
import type { GoRtaCheckConfig } from '../../types/GoRtaCheckConfig.js';

const SEND = 'd-send';
const INTEROP = 'd-interop';
const TESTABLE_ALARM = 'pn-delivery-B2B-ApiGwAlarm';
const OTHER_TESTABLE_ALARM = 'pn-ioAuthorizerLambda-LogInvocationErrors-Alarm';
const NOT_TESTABLE_ALARM = 'pn-some-alarm-without-runbook';

type Choices = ReadonlyArray<Core.GOPromptSelectOption>;
type AnswerFn = (choices: Choices) => unknown;

interface AskedPrompt {
  readonly message: string;
  readonly titles: ReadonlyArray<string>;
}

interface Harness {
  readonly script: Core.GOScript;
  readonly asked: ReadonlyArray<AskedPrompt>;
  readonly warnings: ReadonlyArray<string>;
  readonly errors: ReadonlyArray<string>;
}

/** Picks the first option whose title contains `needle`. */
function byTitle(needle: string): AnswerFn {
  return (choices) => choices.find((choice) => choice.title.includes(needle))?.value;
}

/** Picks the "go back" entry. */
const goBack: AnswerFn = () => BACK_CHOICE;

function harness(answers: ReadonlyArray<AnswerFn>): Harness {
  const asked: AskedPrompt[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  let index = 0;

  const ask = async (message: string, choices: Choices): Promise<unknown> => {
    asked.push({ message, titles: choices.map((choice) => choice.title) });
    const answer = answers[index];
    index += 1;
    if (answer === undefined) throw new Error(`Unexpected prompt: ${message}`);
    return Promise.resolve(answer(choices));
  };

  const script = {
    logger: {
      info: (): void => undefined,
      error: (message: string): void => {
        errors.push(message);
      },
      success: (): void => undefined,
      section: (): void => undefined,
      warning: (message: string): void => {
        warnings.push(message);
      },
    },
    prompt: {
      select: ask,
      autocomplete: ask,
      startSpinner: (): void => undefined,
      stopSpinner: (): void => undefined,
    },
  } as unknown as Core.GOScript;

  return { script, asked, warnings, errors };
}

interface ClientOptions {
  readonly counts?: Readonly<Record<string, number>>;
  /** Alarm ids whose count always fails. */
  readonly failing?: ReadonlyArray<string>;
  /** Collects every count actually issued, to prove memoization. */
  readonly issued?: string[];
}

function fakeClient(options: ClientOptions = {}): never {
  const counts = options.counts ?? {};
  const failing = new Set(options.failing ?? []);
  return {
    listProducts: async () =>
      Promise.resolve([
        { id: SEND, name: 'SEND', description: null },
        { id: INTEROP, name: 'INTEROP', description: null },
      ]),
    listProductEnvironments: async (productId: string) =>
      Promise.resolve(
        productId === SEND
          ? [
              { id: 'e-send-prod', name: 'Produzione', order: 0 },
              { id: 'e-send-uat', name: 'UAT', order: 1 },
              { id: 'e-send-bb', name: 'BuildingBlock', order: 2 },
            ]
          : [{ id: 'e-interop-prod', name: 'Produzione', order: 0 }],
      ),
    listProductAlarms: async () =>
      Promise.resolve([
        { id: 'a1', name: TESTABLE_ALARM, description: null },
        { id: 'a2', name: OTHER_TESTABLE_ALARM, description: null },
        { id: 'a3', name: NOT_TESTABLE_ALARM, description: null },
      ]),
    countAlarmEvents: async (query: { alarmId?: string }) => {
      const alarmId = query.alarmId ?? '';
      options.issued?.push(alarmId);
      if (failing.has(alarmId)) throw new Error(`Watchtower non raggiungibile (${alarmId})`);
      return Promise.resolve(counts[alarmId] ?? 1);
    },
  } as never;
}

const DEFAULT_COUNTS = { a1: 12, a2: 3 };

describe('selectTarget', () => {
  it('walks product → environment → runbook and returns the selection', async () => {
    const { script, asked } = harness([byTitle('SEND'), byTitle('UAT'), byTitle(TESTABLE_ALARM)]);

    const selection = await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), {}, true);

    assert.deepStrictEqual(selection?.environment, { environmentIds: ['e-send-uat'], environmentName: 'UAT' });
    assert.strictEqual(selection?.target.productName, 'SEND');
    assert.strictEqual(selection.target.alarmName, TESTABLE_ALARM);
    assert.deepStrictEqual(
      asked.map((prompt) => prompt.message),
      ['Seleziona il prodotto', "Seleziona l'ambiente (SEND)", 'Seleziona il runbook da testare (SEND · UAT)'],
    );
  });

  it('offers only the alarms with a local runbook, ranked by occurrences', async () => {
    const { script, asked } = harness([byTitle('SEND'), byTitle('Produzione'), byTitle(OTHER_TESTABLE_ALARM)]);

    await selectTarget(script, fakeClient({ counts: { a1: 2, a2: 40 } }), {}, true);

    const runbookPrompt = asked[2];
    assert.ok(runbookPrompt !== undefined);
    assert.deepStrictEqual(runbookPrompt.titles, [
      `${OTHER_TESTABLE_ALARM} · 40 occorrenze`,
      `${TESTABLE_ALARM} · 2 occorrenze`,
      '← Indietro: cambia ambiente o prodotto',
    ]);
  });

  it('hides the runbooks without occurrences behind an explicit entry', async () => {
    const { script, asked } = harness([
      byTitle('SEND'),
      byTitle('Produzione'),
      byTitle('Mostra anche'),
      byTitle(OTHER_TESTABLE_ALARM),
    ]);

    const selection = await selectTarget(script, fakeClient({ counts: { a1: 5, a2: 0 } }), {}, true);

    assert.strictEqual(selection?.target.alarmName, OTHER_TESTABLE_ALARM);
    const beforeExpanding = asked[2];
    const afterExpanding = asked[3];
    assert.ok(beforeExpanding !== undefined && afterExpanding !== undefined);
    assert.ok(!beforeExpanding.titles.some((title) => title.startsWith(OTHER_TESTABLE_ALARM)));
    assert.ok(afterExpanding.titles.includes(`${OTHER_TESTABLE_ALARM} · nessuna occorrenza`));
  });

  it('goes back from the runbook step to the environment step', async () => {
    const { script, asked } = harness([
      byTitle('SEND'),
      byTitle('UAT'),
      goBack,
      byTitle('Produzione'),
      byTitle(TESTABLE_ALARM),
    ]);

    const selection = await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), {}, true);

    assert.strictEqual(selection?.environment.environmentName, 'Produzione');
    assert.deepStrictEqual(
      asked.map((prompt) => prompt.message),
      [
        'Seleziona il prodotto',
        "Seleziona l'ambiente (SEND)",
        'Seleziona il runbook da testare (SEND · UAT)',
        "Seleziona l'ambiente (SEND)",
        'Seleziona il runbook da testare (SEND · Produzione)',
      ],
    );
  });

  it('goes back from the environment step to the product step', async () => {
    const { script, asked } = harness([byTitle('SEND'), goBack, byTitle('INTEROP'), byTitle(TESTABLE_ALARM)]);

    const selection = await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), {}, true);

    assert.strictEqual(selection?.target.productName, 'INTEROP');
    // INTEROP has a single environment: it is resolved without asking.
    assert.strictEqual(selection.environment.environmentName, 'Produzione');
    assert.deepStrictEqual(
      asked.map((prompt) => prompt.message),
      [
        'Seleziona il prodotto',
        "Seleziona l'ambiente (SEND)",
        'Seleziona il prodotto',
        'Seleziona il runbook da testare (INTEROP · Produzione)',
      ],
    );
  });

  it('skips the implied steps and drops the back entry when there is nowhere to go', async () => {
    const config: GoRtaCheckConfig = { targets: [`${INTEROP}:e-interop-prod`] };
    const { script, asked } = harness([byTitle(TESTABLE_ALARM)]);

    const selection = await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), config, true);

    assert.strictEqual(selection?.target.productId, INTEROP);
    assert.strictEqual(asked.length, 1);
    const runbookPrompt = asked[0];
    assert.ok(runbookPrompt !== undefined);
    assert.ok(!runbookPrompt.titles.some((title) => title.startsWith('← Indietro')));
  });

  it('restricts products and environments to the configured scope', async () => {
    const config: GoRtaCheckConfig = { targets: [`${SEND}:e-send-prod|e-send-uat`] };
    const { script, asked } = harness([byTitle('Produzione'), byTitle(TESTABLE_ALARM)]);

    await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), config, true);

    const environmentPrompt = asked[0];
    assert.ok(environmentPrompt !== undefined);
    assert.deepStrictEqual(environmentPrompt.titles, ['Produzione', 'UAT', 'Tutti gli ambienti (2)']);
  });

  it('filters the occurrences on the scoped environments when the user picks them all', async () => {
    const config: GoRtaCheckConfig = { targets: [`${SEND}:e-send-prod|e-send-uat`] };
    const { script } = harness([byTitle('Tutti gli ambienti'), byTitle(TESTABLE_ALARM)]);

    const selection = await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), config, true);

    assert.deepStrictEqual(selection?.environment.environmentIds, ['e-send-prod', 'e-send-uat']);
    assert.match(selection.environment.environmentName, /Produzione, UAT/u);
  });

  it('applies no environment filter when every environment is picked out of scope', async () => {
    const { script } = harness([byTitle('SEND'), byTitle('Tutti gli ambienti'), byTitle(TESTABLE_ALARM)]);

    const selection = await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), {}, true);

    assert.ok(selection !== undefined);
    assert.strictEqual(selection.environment.environmentIds, undefined);
    assert.strictEqual(selection.environment.environmentName, 'tutti gli ambienti');
  });

  it('asks nothing when product, environment and alarm are pinned by configuration', async () => {
    const config: GoRtaCheckConfig = {
      productId: SEND,
      environmentId: 'e-send-prod',
      alarmName: TESTABLE_ALARM,
    };
    const { script, asked } = harness([]);

    const selection = await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), config, true);

    assert.strictEqual(asked.length, 0);
    assert.strictEqual(selection?.target.alarmName, TESTABLE_ALARM);
    assert.deepStrictEqual(selection.environment, {
      environmentIds: ['e-send-prod'],
      environmentName: 'Produzione',
    });
  });

  it('warns about scope entries that do not exist in Watchtower, without dropping the valid ones', async () => {
    const config: GoRtaCheckConfig = { targets: [`${SEND}:e-send-uat|e-ghost`, 'd-ghost'] };
    const { script, warnings, errors } = harness([byTitle(TESTABLE_ALARM)]);

    const selection = await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), config, true);

    assert.ok(warnings.some((message) => message.includes('d-ghost')));
    assert.ok(warnings.some((message) => message.includes('e-ghost')));
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(selection?.environment.environmentIds, ['e-send-uat']);
  });

  it('aborts instead of widening the run when every scoped environment is unknown', async () => {
    const config: GoRtaCheckConfig = { targets: [`${SEND}:e-ghost`] };
    const { script, asked, errors } = harness([]);

    const selection = await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), config, true);

    assert.strictEqual(selection, undefined);
    assert.strictEqual(asked.length, 0);
    assert.ok(errors.some((message) => message.includes('Nessun ambiente valido')));
  });

  it('aborts when the user escapes a prompt', async () => {
    const { script } = harness([() => undefined]);

    assert.strictEqual(await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), {}, true), undefined);
  });

  describe('without prompts', () => {
    it('resolves the omitted environment to all of them, without asking', async () => {
      const config: GoRtaCheckConfig = { productId: SEND, alarmName: TESTABLE_ALARM };
      const { script, asked } = harness([]);

      const selection = await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), config, false);

      assert.strictEqual(asked.length, 0);
      assert.strictEqual(selection?.target.alarmName, TESTABLE_ALARM);
      assert.deepStrictEqual(selection.environment, { environmentName: 'tutti gli ambienti' });
    });

    it('narrows the omitted environment to the scoped ones', async () => {
      const config: GoRtaCheckConfig = {
        productId: SEND,
        alarmName: TESTABLE_ALARM,
        targets: [`${SEND}:e-send-prod|e-send-uat`],
      };
      const { script, asked } = harness([]);

      const selection = await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), config, false);

      assert.strictEqual(asked.length, 0);
      assert.deepStrictEqual(selection?.environment.environmentIds, ['e-send-prod', 'e-send-uat']);
    });

    it('aborts on an ambiguous product instead of hanging on a prompt', async () => {
      const { script, asked, errors } = harness([]);

      const selection = await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), {}, false);

      assert.strictEqual(selection, undefined);
      assert.strictEqual(asked.length, 0);
      assert.ok(errors.some((message) => message.includes('--product-id')));
    });

    it('aborts on a missing alarm name instead of hanging on a prompt', async () => {
      const { script, asked, errors } = harness([]);

      const selection = await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), { productId: SEND }, false);

      assert.strictEqual(selection, undefined);
      assert.strictEqual(asked.length, 0);
      assert.ok(errors.some((message) => message.includes('--alarm-name')));
    });
  });

  describe('pinned values obey the scope', () => {
    it('accepts a pinned product and environment that stay inside the scope', async () => {
      const config: GoRtaCheckConfig = {
        targets: [`${SEND}:e-send-prod|e-send-uat`],
        productId: SEND,
        environmentId: 'e-send-uat',
        alarmName: TESTABLE_ALARM,
      };
      const { script, errors } = harness([]);

      const selection = await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), config, true);

      assert.deepStrictEqual(errors, []);
      assert.deepStrictEqual(selection?.environment, { environmentIds: ['e-send-uat'], environmentName: 'UAT' });
    });

    it('rejects a pinned product outside the scope instead of escaping it', async () => {
      const config: GoRtaCheckConfig = { targets: [INTEROP], productId: SEND, alarmName: TESTABLE_ALARM };
      const { script, errors } = harness([]);

      const selection = await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), config, true);

      assert.strictEqual(selection, undefined);
      assert.ok(errors.some((message) => message.includes('fuori dallo scope configurato (targets)')));
    });

    it('rejects a pinned environment outside the scope', async () => {
      const config: GoRtaCheckConfig = {
        targets: [`${SEND}:e-send-prod`],
        productId: SEND,
        environmentId: 'e-send-uat',
        alarmName: TESTABLE_ALARM,
      };
      const { script, errors } = harness([]);

      const selection = await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), config, true);

      assert.strictEqual(selection, undefined);
      assert.ok(errors.some((message) => message.includes('fuori dallo scope configurato (targets)')));
    });

    it('rejects a pinned environment that does not exist', async () => {
      const config: GoRtaCheckConfig = { productId: SEND, environmentId: 'ghost', alarmName: TESTABLE_ALARM };
      const { script, errors } = harness([]);

      const selection = await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), config, true);

      assert.strictEqual(selection, undefined);
      assert.ok(errors.some((message) => message.includes('non appartiene al prodotto SEND')));
    });

    it('rejects a pinned environment that belongs to another product', async () => {
      const config: GoRtaCheckConfig = { productId: SEND, environmentId: 'e-interop-prod', alarmName: TESTABLE_ALARM };
      const { script, errors } = harness([]);

      const selection = await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), config, true);

      assert.strictEqual(selection, undefined);
      assert.ok(errors.some((message) => message.includes('non appartiene al prodotto SEND')));
    });

    it('still rejects a pinned product unknown to Watchtower', async () => {
      const config: GoRtaCheckConfig = { productId: 'd-ghost', alarmName: TESTABLE_ALARM };
      const { script, errors } = harness([]);

      const selection = await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS }), config, true);

      assert.strictEqual(selection, undefined);
      assert.ok(errors.some((message) => message.includes('non trovato in Watchtower')));
    });
  });

  describe('failing counts', () => {
    it('reports how many counts failed, and why, instead of staying silent', async () => {
      const { script, warnings } = harness([byTitle('SEND'), byTitle('Produzione'), byTitle(TESTABLE_ALARM)]);

      await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS, failing: ['a2'] }), {}, true);

      const reported = warnings.find((message) => message.includes('Conteggio non disponibile'));
      assert.ok(reported !== undefined);
      assert.match(reported, /1 runbook su 2/u);
      assert.match(reported, /Watchtower non raggiungibile/u);
    });

    it('keeps the runbook selectable when its count is unknown', async () => {
      const { script, asked } = harness([byTitle('SEND'), byTitle('Produzione'), byTitle(OTHER_TESTABLE_ALARM)]);

      const selection = await selectTarget(script, fakeClient({ counts: { a1: 4 }, failing: ['a2'] }), {}, true);

      assert.strictEqual(selection?.target.alarmName, OTHER_TESTABLE_ALARM);
      const runbookPrompt = asked[2];
      assert.ok(runbookPrompt !== undefined);
      assert.ok(runbookPrompt.titles.some((title) => title.includes('conteggio non disponibile')));
    });

    it('does not re-issue a failed count when the user goes back', async () => {
      const issued: string[] = [];
      const { script } = harness([
        byTitle('SEND'),
        byTitle('Produzione'),
        goBack,
        byTitle('Produzione'),
        byTitle(TESTABLE_ALARM),
      ]);

      await selectTarget(script, fakeClient({ counts: DEFAULT_COUNTS, failing: ['a2'], issued }), {}, true);

      assert.deepStrictEqual(issued.toSorted(), ['a1', 'a2']);
    });
  });
});
