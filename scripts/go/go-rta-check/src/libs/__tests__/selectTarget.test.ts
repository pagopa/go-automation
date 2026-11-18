import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GO_PROMPT_BACK, type GOPromptSelectOption, type GOScript } from '@go-automation/go-script';

import { createTargetWizardSession, selectTarget } from '../selectTarget.js';
import type { TargetSelection } from '../selectTarget.js';
import { BACK_CHOICE } from '../promptChoice.js';
import type { GoRtaCheckConfig } from '../../types/GoRtaCheckConfig.js';

const SEND = 'd-send';
const INTEROP = 'd-interop';
const TESTABLE_ALARM = 'pn-delivery-B2B-ApiGwAlarm';
const OTHER_TESTABLE_ALARM = 'pn-ioAuthorizerLambda-LogInvocationErrors-Alarm';
const NOT_TESTABLE_ALARM = 'pn-some-alarm-without-runbook';

const PRODUCT_MESSAGE = 'Seleziona il prodotto';
const SEND_ENVIRONMENT_MESSAGE = "Seleziona l'ambiente (SEND)";

type Choices = ReadonlyArray<GOPromptSelectOption>;
type AnswerFn = (choices: Choices) => unknown;

interface AskedPrompt {
  readonly message: string;
  readonly titles: ReadonlyArray<string>;
}

interface Harness {
  readonly script: GOScript;
  readonly asked: ReadonlyArray<AskedPrompt>;
  readonly warnings: ReadonlyArray<string>;
  readonly errors: ReadonlyArray<string>;
}

/** Picks the first option whose title contains `needle`. */
function byTitle(needle: string): AnswerFn {
  return (choices) => choices.find((choice) => choice.title.includes(needle))?.value;
}

/** The two ways of going back: the "go back" entry and the ← key. */
const BACK_ANSWERS: ReadonlyArray<readonly [string, AnswerFn]> = [
  ['the back entry', () => BACK_CHOICE],
  ['the ← key', () => GO_PROMPT_BACK],
];

/** Fails the test unless the wizard completed, and narrows the outcome. */
function selected(outcome: TargetSelection): Extract<TargetSelection, { kind: 'VALUE' }> {
  assert.strictEqual(outcome.kind, 'VALUE');
  return outcome;
}

/** Message of the runbook step for a product and an environment. */
function runbookMessage(product: string, environment: string): string {
  return `Seleziona il runbook da testare (${product} · ${environment})`;
}

/** Fails the test unless the prompt at `index` was asked, and returns it. */
function promptAt(asked: ReadonlyArray<AskedPrompt>, index: number): AskedPrompt {
  const prompt = asked[index];
  assert.ok(prompt !== undefined);
  return prompt;
}

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
      selectWithBack: ask,
      autocomplete: ask,
      autocompleteWithBack: ask,
      startSpinner: (): void => undefined,
      stopSpinner: (): void => undefined,
    },
  } as unknown as GOScript;

  return { script, asked, warnings, errors };
}

interface ClientOptions {
  readonly counts?: Readonly<Record<string, number>>;
  /** Alarm ids whose count always fails. */
  readonly failing?: ReadonlyArray<string>;
  /** Collects every count actually issued, to prove memoization. */
  readonly issued?: string[];
  /** Counts the product list reads, to prove they are shared across wizard runs. */
  readonly productReads?: { count: number };
}

const DEFAULT_COUNTS: Readonly<Record<string, number>> = { a1: 12, a2: 3 };

function fakeClient(options: ClientOptions = {}): never {
  const counts = options.counts ?? DEFAULT_COUNTS;
  const failing = new Set(options.failing ?? []);
  return {
    listProducts: async () => {
      if (options.productReads !== undefined) options.productReads.count += 1;
      return Promise.resolve([
        { id: SEND, name: 'SEND', description: null },
        { id: INTEROP, name: 'INTEROP', description: null },
      ]);
    },
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

/** Runs the wizard once through SEND · UAT, returning the selection to resume from. */
async function selectSendUat(): Promise<Extract<TargetSelection, { kind: 'VALUE' }>> {
  const { script } = harness([byTitle('SEND'), byTitle('UAT'), byTitle(TESTABLE_ALARM)]);
  return selected(await selectTarget(script, fakeClient(), {}, true));
}

describe('selectTarget', () => {
  it('walks product → environment → runbook and returns the selection with the state to resume from', async () => {
    const { script, asked } = harness([byTitle('SEND'), byTitle('UAT'), byTitle(TESTABLE_ALARM)]);

    const selection = selected(await selectTarget(script, fakeClient(), {}, true));

    assert.deepStrictEqual(selection.environment, { environmentIds: ['e-send-uat'], environmentName: 'UAT' });
    assert.strictEqual(selection.target.productName, 'SEND');
    assert.strictEqual(selection.target.alarmName, TESTABLE_ALARM);
    assert.deepStrictEqual(selection.resume, {
      product: { productId: SEND, productName: 'SEND' },
      productInteractive: true,
      environment: { environmentIds: ['e-send-uat'], environmentName: 'UAT' },
      environmentInteractive: true,
    });
    assert.deepStrictEqual(
      asked.map((prompt) => prompt.message),
      [PRODUCT_MESSAGE, SEND_ENVIRONMENT_MESSAGE, runbookMessage('SEND', 'UAT')],
    );
    // The ← shortcut is announced on the entry it stands for, and only where there is a way back.
    assert.ok(!promptAt(asked, 0).titles.some((title) => title.includes('premi ←')));
    assert.ok(promptAt(asked, 1).titles.includes('← Indietro: cambia prodotto · premi ←'));
  });

  it('offers only the alarms with a local runbook, ranked by occurrences', async () => {
    const { script, asked } = harness([byTitle('SEND'), byTitle('Produzione'), byTitle(OTHER_TESTABLE_ALARM)]);

    await selectTarget(script, fakeClient({ counts: { a1: 2, a2: 40 } }), {}, true);

    assert.deepStrictEqual(promptAt(asked, 2).titles, [
      `${OTHER_TESTABLE_ALARM} · 40 occorrenze`,
      `${TESTABLE_ALARM} · 2 occorrenze`,
      '← Indietro: cambia ambiente o prodotto · premi ←',
    ]);
  });

  it('hides the runbooks without occurrences behind an explicit entry', async () => {
    const { script, asked } = harness([
      byTitle('SEND'),
      byTitle('Produzione'),
      byTitle('Mostra anche'),
      byTitle(OTHER_TESTABLE_ALARM),
    ]);

    const selection = selected(await selectTarget(script, fakeClient({ counts: { a1: 5, a2: 0 } }), {}, true));

    assert.strictEqual(selection.target.alarmName, OTHER_TESTABLE_ALARM);
    assert.ok(!promptAt(asked, 2).titles.some((title) => title.startsWith(OTHER_TESTABLE_ALARM)));
    assert.ok(promptAt(asked, 3).titles.includes(`${OTHER_TESTABLE_ALARM} · nessuna occorrenza`));
  });

  for (const [way, back] of BACK_ANSWERS) {
    it(`goes back from the runbook step to the environment step with ${way}`, async () => {
      const { script, asked } = harness([
        byTitle('SEND'),
        byTitle('UAT'),
        back,
        byTitle('Produzione'),
        byTitle(TESTABLE_ALARM),
      ]);

      const selection = selected(await selectTarget(script, fakeClient(), {}, true));

      assert.strictEqual(selection.environment.environmentName, 'Produzione');
      assert.deepStrictEqual(
        asked.map((prompt) => prompt.message),
        [
          PRODUCT_MESSAGE,
          SEND_ENVIRONMENT_MESSAGE,
          runbookMessage('SEND', 'UAT'),
          SEND_ENVIRONMENT_MESSAGE,
          runbookMessage('SEND', 'Produzione'),
        ],
      );
    });

    it(`goes back from the environment step to the product step with ${way}`, async () => {
      const { script, asked } = harness([byTitle('SEND'), back, byTitle('INTEROP'), byTitle(TESTABLE_ALARM)]);

      const selection = selected(await selectTarget(script, fakeClient(), {}, true));

      assert.strictEqual(selection.target.productName, 'INTEROP');
      // INTEROP has a single environment: it is resolved without asking.
      assert.strictEqual(selection.environment.environmentName, 'Produzione');
      assert.deepStrictEqual(
        asked.map((prompt) => prompt.message),
        [PRODUCT_MESSAGE, SEND_ENVIRONMENT_MESSAGE, PRODUCT_MESSAGE, runbookMessage('INTEROP', 'Produzione')],
      );
    });
  }

  it('skips the implied steps, drops the back entry and does not offer them again', async () => {
    const config: GoRtaCheckConfig = { targets: [`${INTEROP}:e-interop-prod`] };
    const { script, asked } = harness([byTitle(TESTABLE_ALARM)]);

    const selection = selected(await selectTarget(script, fakeClient(), config, true));

    assert.strictEqual(selection.target.productId, INTEROP);
    assert.strictEqual(asked.length, 1);
    assert.ok(!promptAt(asked, 0).titles.some((title) => title.startsWith('← Indietro')));
    assert.strictEqual(selection.resume.productInteractive, false);
    assert.strictEqual(selection.resume.environmentInteractive, false);
  });

  it('restricts the environments to the configured scope and filters on all of them when picked', async () => {
    const config: GoRtaCheckConfig = { targets: [`${SEND}:e-send-prod|e-send-uat`] };
    const { script, asked } = harness([byTitle('Tutti gli ambienti'), byTitle(TESTABLE_ALARM)]);

    const selection = selected(await selectTarget(script, fakeClient(), config, true));

    assert.deepStrictEqual(promptAt(asked, 0).titles, ['Produzione', 'UAT', 'Tutti gli ambienti (2)']);
    assert.deepStrictEqual(selection.environment.environmentIds, ['e-send-prod', 'e-send-uat']);
    assert.match(selection.environment.environmentName, /Produzione, UAT/u);
  });

  it('applies no environment filter when every environment is picked out of scope', async () => {
    const { script } = harness([byTitle('SEND'), byTitle('Tutti gli ambienti'), byTitle(TESTABLE_ALARM)]);

    const selection = selected(await selectTarget(script, fakeClient(), {}, true));

    assert.deepStrictEqual(selection.environment, { environmentName: 'tutti gli ambienti' });
  });

  it('asks nothing when product, environment and alarm are pinned by configuration', async () => {
    const config: GoRtaCheckConfig = { productId: SEND, environmentId: 'e-send-prod', alarmName: TESTABLE_ALARM };
    const { script } = harness([]);

    const selection = selected(await selectTarget(script, fakeClient(), config, true));

    assert.strictEqual(selection.target.alarmName, TESTABLE_ALARM);
    assert.deepStrictEqual(selection.environment, { environmentIds: ['e-send-prod'], environmentName: 'Produzione' });
  });

  it('accepts a pinned product and environment that stay inside the scope', async () => {
    const config: GoRtaCheckConfig = {
      targets: [`${SEND}:e-send-prod|e-send-uat`],
      productId: SEND,
      environmentId: 'e-send-uat',
      alarmName: TESTABLE_ALARM,
    };
    const { script, errors } = harness([]);

    const selection = selected(await selectTarget(script, fakeClient(), config, true));

    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(selection.environment, { environmentIds: ['e-send-uat'], environmentName: 'UAT' });
  });

  it('warns about scope entries that do not exist in Watchtower, without dropping the valid ones', async () => {
    const config: GoRtaCheckConfig = { targets: [`${SEND}:e-send-uat|e-ghost`, 'd-ghost'] };
    const { script, warnings, errors } = harness([byTitle(TESTABLE_ALARM)]);

    const selection = selected(await selectTarget(script, fakeClient(), config, true));

    assert.ok(warnings.some((message) => message.includes('d-ghost')));
    assert.ok(warnings.some((message) => message.includes('e-ghost')));
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(selection.environment.environmentIds, ['e-send-uat']);
  });

  describe('without prompts', () => {
    it('resolves the omitted environment to all of them', async () => {
      const config: GoRtaCheckConfig = { productId: SEND, alarmName: TESTABLE_ALARM };

      const selection = selected(await selectTarget(harness([]).script, fakeClient(), config, false));

      assert.strictEqual(selection.target.alarmName, TESTABLE_ALARM);
      assert.deepStrictEqual(selection.environment, { environmentName: 'tutti gli ambienti' });
    });

    it('narrows the omitted environment to the scoped ones', async () => {
      const config: GoRtaCheckConfig = {
        productId: SEND,
        alarmName: TESTABLE_ALARM,
        targets: [`${SEND}:e-send-prod|e-send-uat`],
      };

      const selection = selected(await selectTarget(harness([]).script, fakeClient(), config, false));

      assert.deepStrictEqual(selection.environment.environmentIds, ['e-send-prod', 'e-send-uat']);
    });
  });

  describe('failing instead of asking, widening or escaping the scope', () => {
    const outsideScope = 'fuori dallo scope configurato (targets)';
    const notOfSend = 'non appartiene al prodotto SEND';
    const cases: ReadonlyArray<{
      readonly name: string;
      readonly config: GoRtaCheckConfig;
      readonly allowPrompt: boolean;
      readonly error: string;
    }> = [
      {
        name: 'every scoped environment is unknown',
        config: { targets: [`${SEND}:e-ghost`] },
        allowPrompt: true,
        error: 'Nessun ambiente valido',
      },
      { name: 'the product is ambiguous without prompts', config: {}, allowPrompt: false, error: '--product-id' },
      {
        name: 'the alarm name is missing without prompts',
        config: { productId: SEND },
        allowPrompt: false,
        error: '--alarm-name',
      },
      {
        name: 'a pinned product is outside the scope',
        config: { targets: [INTEROP], productId: SEND, alarmName: TESTABLE_ALARM },
        allowPrompt: true,
        error: outsideScope,
      },
      {
        name: 'a pinned environment is outside the scope',
        config: {
          targets: [`${SEND}:e-send-prod`],
          productId: SEND,
          environmentId: 'e-send-uat',
          alarmName: TESTABLE_ALARM,
        },
        allowPrompt: true,
        error: outsideScope,
      },
      {
        name: 'a pinned environment does not exist',
        config: { productId: SEND, environmentId: 'ghost', alarmName: TESTABLE_ALARM },
        allowPrompt: true,
        error: notOfSend,
      },
      {
        name: 'a pinned environment belongs to another product',
        config: { productId: SEND, environmentId: 'e-interop-prod', alarmName: TESTABLE_ALARM },
        allowPrompt: true,
        error: notOfSend,
      },
      {
        name: 'a pinned product is unknown to Watchtower',
        config: { productId: 'd-ghost', alarmName: TESTABLE_ALARM },
        allowPrompt: true,
        error: 'non trovato in Watchtower',
      },
    ];

    for (const { name, config, allowPrompt, error } of cases) {
      it(`fails, without calling it a cancellation, when ${name}`, async () => {
        const { script, warnings, errors } = harness([]);

        const outcome = await selectTarget(script, fakeClient(), config, allowPrompt);

        assert.strictEqual(outcome.kind, 'FAILED');
        assert.ok(errors.some((message) => message.includes(error)));
        assert.ok(!warnings.some((message) => message.toLowerCase().includes('annullat')));
      });
    }
  });

  it('tells a user abort apart from a failure, so it does not fail the run', async () => {
    const { script, warnings, errors } = harness([() => undefined]);

    const outcome = await selectTarget(script, fakeClient(), {}, true);

    assert.strictEqual(outcome.kind, 'CANCELLED');
    assert.deepStrictEqual(errors, []);
    assert.ok(warnings.some((message) => message.includes('Selezione annullata')));
  });

  describe('running the wizard again', () => {
    it('resumes on the runbook step, keeping the product and the environment', async () => {
      const previous = await selectSendUat();
      const { script, asked } = harness([byTitle(OTHER_TESTABLE_ALARM)]);

      const selection = selected(await selectTarget(script, fakeClient(), {}, true, { resume: previous.resume }));

      assert.strictEqual(selection.target.alarmName, OTHER_TESTABLE_ALARM);
      assert.strictEqual(selection.environment.environmentName, 'UAT');
      assert.deepStrictEqual(
        asked.map((prompt) => prompt.message),
        [runbookMessage('SEND', 'UAT')],
      );
    });

    it('still goes back to the earlier steps of a resumed wizard', async () => {
      const previous = await selectSendUat();
      const { script } = harness([() => BACK_CHOICE, byTitle('Produzione'), byTitle(TESTABLE_ALARM)]);

      const selection = selected(await selectTarget(script, fakeClient(), {}, true, { resume: previous.resume }));

      assert.strictEqual(selection.environment.environmentName, 'Produzione');
    });

    it('shares the memoized reads across two runs, without re-querying Watchtower', async () => {
      const productReads = { count: 0 };
      const issued: string[] = [];
      const client = fakeClient({ issued, productReads });
      const session = createTargetWizardSession(client);

      for (const alarm of [TESTABLE_ALARM, OTHER_TESTABLE_ALARM]) {
        const { script } = harness([byTitle('SEND'), byTitle('Produzione'), byTitle(alarm)]);
        await selectTarget(script, client, {}, true, { session });
      }

      assert.strictEqual(productReads.count, 1);
      assert.deepStrictEqual(issued.toSorted(), ['a1', 'a2']);
    });
  });

  describe('failing counts', () => {
    it('reports how many counts failed and why, keeping the runbook selectable', async () => {
      const { script, asked, warnings } = harness([
        byTitle('SEND'),
        byTitle('Produzione'),
        byTitle(OTHER_TESTABLE_ALARM),
      ]);

      const outcome = await selectTarget(script, fakeClient({ counts: { a1: 4 }, failing: ['a2'] }), {}, true);

      assert.strictEqual(selected(outcome).target.alarmName, OTHER_TESTABLE_ALARM);
      assert.ok(promptAt(asked, 2).titles.some((title) => title.includes('conteggio non disponibile')));
      const reported = warnings.find((message) => message.includes('Conteggio non disponibile'));
      assert.ok(reported !== undefined);
      assert.match(reported, /1 runbook su 2/u);
      assert.match(reported, /Watchtower non raggiungibile/u);
    });

    it('does not re-issue a failed count when the user goes back', async () => {
      const issued: string[] = [];
      const { script } = harness([
        byTitle('SEND'),
        byTitle('Produzione'),
        () => BACK_CHOICE,
        byTitle('Produzione'),
        byTitle(TESTABLE_ALARM),
      ]);

      await selectTarget(script, fakeClient({ failing: ['a2'], issued }), {}, true);

      assert.deepStrictEqual(issued.toSorted(), ['a1', 'a2']);
    });
  });
});
