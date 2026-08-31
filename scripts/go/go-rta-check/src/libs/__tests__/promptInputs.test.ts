import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Core } from '@go-automation/go-common';

import { resolvePeriod } from '../promptInputs.js';
import type { GoRtaCheckConfig } from '../../types/GoRtaCheckConfig.js';

interface Harness {
  readonly script: Core.GOScript;
  /** Messages of the date questions asked, in order. */
  readonly askedDates: ReadonlyArray<string>;
  /** Preset titles offered by the range picker, when it was shown. */
  readonly offeredPresets: ReadonlyArray<string>;
  /** Titles of the "go back" entries offered by the range picker. */
  readonly offeredBack: ReadonlyArray<string>;
}

interface Answers {
  /** Range returned by the picker, when the picker is the one asked. */
  readonly range?: Core.GOPromptDateRange;
  /** Answers to the single-bound questions, in order. */
  readonly dates?: ReadonlyArray<Date | undefined>;
  /** Makes the picker answer with the shortcut instead of a range. */
  readonly goBack?: boolean;
}

function harness(answers: Answers = {}): Harness {
  const askedDates: string[] = [];
  const offeredPresets: string[] = [];
  const offeredBack: string[] = [];
  const dates = [...(answers.dates ?? [])];

  const pickRange = async (
    _message: string,
    options?: Core.GOPromptDateRangeOptions,
  ): Promise<Core.GOPromptDateRange | typeof Core.GO_PROMPT_BACK | undefined> => {
    offeredPresets.push(...(options?.presets ?? []).map((preset) => preset.title));
    if (options?.backLabel !== undefined) offeredBack.push(options.backLabel);
    return await Promise.resolve(answers.goBack === true ? Core.GO_PROMPT_BACK : answers.range);
  };

  const script = {
    prompt: {
      dateRange: pickRange,
      dateRangeWithBack: pickRange,
      date: async (message: string): Promise<Date | undefined> => {
        askedDates.push(message);
        return Promise.resolve(dates.shift());
      },
    },
  } as unknown as Core.GOScript;

  return { script, askedDates, offeredPresets, offeredBack };
}

function config(overrides: GoRtaCheckConfig = {}): GoRtaCheckConfig {
  return overrides;
}

describe('resolvePeriod', () => {
  it('offers the presets when no bound is pinned by flags', async () => {
    const { script, offeredPresets, askedDates } = harness({
      range: { from: new Date('2026-08-17T10:00:00.000Z'), to: new Date('2026-08-24T10:00:00.000Z') },
    });

    const period = await resolvePeriod(script, config(), true);

    assert.deepStrictEqual(offeredPresets, [
      'Ultime 24 ore',
      'Ultimi 7 giorni',
      'Ultimi 30 giorni',
      'Mese corrente',
      'Nessun limite',
      'Personalizzato…',
    ]);
    assert.deepStrictEqual(askedDates, []);
    assert.deepStrictEqual(period, {
      kind: 'VALUE',
      dateFrom: '2026-08-17T10:00:00.000Z',
      dateTo: '2026-08-24T10:00:00.000Z',
    });
  });

  it('reads an unbounded preset, and a cancelled picker, as no limit', async () => {
    assert.deepStrictEqual(await resolvePeriod(harness({ range: {} }).script, config(), true), {
      kind: 'VALUE',
      dateFrom: '',
      dateTo: '',
    });
    assert.deepStrictEqual(await resolvePeriod(harness().script, config(), true), {
      kind: 'VALUE',
      dateFrom: '',
      dateTo: '',
    });
  });

  it('normalizes bounds pinned by flags, without prompting', async () => {
    const { script, askedDates, offeredPresets } = harness();

    const period = await resolvePeriod(script, config({ dateFrom: '24/08/2026', dateTo: '2026-08-25' }), true);

    assert.deepStrictEqual(askedDates, []);
    assert.deepStrictEqual(offeredPresets, []);
    assert.deepStrictEqual(period, {
      kind: 'VALUE',
      dateFrom: '2026-08-24T00:00:00.000Z',
      dateTo: '2026-08-25T23:59:59.999Z',
    });
  });

  it('asks only for the bound the flags left out', async () => {
    const { script, askedDates } = harness({ dates: [new Date('2026-08-25T23:59:59.999Z')] });

    const period = await resolvePeriod(script, config({ dateFrom: '2026-08-24T06:00:00Z' }), true);

    assert.deepStrictEqual(askedDates, ['Data fine (vuoto = nessun limite)']);
    assert.deepStrictEqual(period, {
      kind: 'VALUE',
      dateFrom: '2026-08-24T06:00:00.000Z',
      dateTo: '2026-08-25T23:59:59.999Z',
    });
  });

  it('never asks when prompts are not allowed', async () => {
    const { script, askedDates, offeredPresets } = harness();

    const period = await resolvePeriod(script, config({ dateFrom: '2026-08-24' }), false);

    assert.deepStrictEqual(askedDates, []);
    assert.deepStrictEqual(offeredPresets, []);
    assert.deepStrictEqual(period, { kind: 'VALUE', dateFrom: '2026-08-24T00:00:00.000Z', dateTo: '' });
  });

  it('rejects a bound the flags pinned to something unparseable', async () => {
    const { script } = harness();

    await assert.rejects(
      resolvePeriod(script, config({ dateFrom: 'la settimana scorsa' }), false),
      /Data inizio non valida/,
    );
  });

  it('keeps an explicitly empty bound unbounded', async () => {
    const { script, askedDates } = harness();

    const period = await resolvePeriod(script, config({ dateFrom: '', dateTo: '  ' }), true);

    assert.deepStrictEqual(askedDates, []);
    assert.deepStrictEqual(period, { kind: 'VALUE', dateFrom: '', dateTo: '' });
  });

  describe('going back to the runbook step', () => {
    it('offers no way back unless the caller allows it', async () => {
      const { script, offeredBack } = harness({ range: {} });

      await resolvePeriod(script, config(), true);

      assert.deepStrictEqual(offeredBack, []);
    });

    it('offers the way back, and announces its shortcut, when allowed', async () => {
      const { script, offeredBack } = harness({ range: {} });

      await resolvePeriod(script, config(), true, true);

      assert.deepStrictEqual(offeredBack, ['← Indietro: cambia runbook · premi ←']);
    });

    it('reports the way back instead of a period', async () => {
      const { script, askedDates } = harness({ goBack: true });

      const period = await resolvePeriod(script, config(), true, true);

      assert.deepStrictEqual(period, { kind: 'BACK' });
      assert.deepStrictEqual(askedDates, []);
    });

    it('never asks for the period when the bounds are pinned by flags', async () => {
      const { script, offeredBack, offeredPresets } = harness({ goBack: true });

      const period = await resolvePeriod(script, config({ dateFrom: '2026-08-24', dateTo: '' }), true, true);

      assert.deepStrictEqual(offeredPresets, []);
      assert.deepStrictEqual(offeredBack, []);
      assert.deepStrictEqual(period, { kind: 'VALUE', dateFrom: '2026-08-24T00:00:00.000Z', dateTo: '' });
    });
  });
});
