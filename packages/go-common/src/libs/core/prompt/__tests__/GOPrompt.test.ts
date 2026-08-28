/**
 * Tests for GOPrompt
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { GOPrompt, type GOPromptAdapter, type GOPromptInputOptions } from '../GOPrompt.js';
import { GOLogger } from '../../logging/GOLogger.js';

// Mock logger
const logger = new GOLogger([]);

function createPrompt(values: unknown[]): GOPrompt {
  const next = <T>(): T | undefined => values.shift() as T | undefined;
  const adapter: GOPromptAdapter = {
    text: async () => next(),
    password: async () => next(),
    number: async () => next(),
    confirm: async () => next(),
    select: async () => next(),
    checkbox: async () => next(),
    search: async () => next(),
  };

  return new GOPrompt(logger, false, adapter);
}

describe('GOPrompt', () => {
  let stdoutWriteMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    stdoutWriteMock = mock.method(process.stdout, 'write', () => true);
  });

  afterEach(() => {
    stdoutWriteMock.mock.restore();
  });

  it('text prompt returns value', async () => {
    const prompt = createPrompt(['test value']);

    const result = await prompt.text('Enter text');
    assert.strictEqual(result, 'test value');
  });

  it('text prompt returns undefined when cancelled', async () => {
    const prompt = createPrompt([undefined]);

    const result = await prompt.text('Enter text');
    assert.strictEqual(result, undefined);
  });

  it('password prompt returns undefined when cancelled', async () => {
    const prompt = createPrompt([undefined]);

    const result = await prompt.password('Enter password');
    assert.strictEqual(result, undefined);
  });

  it('number prompt returns undefined when cancelled', async () => {
    const prompt = createPrompt([undefined]);

    const result = await prompt.number('Enter number');
    assert.strictEqual(result, undefined);
  });

  it('confirm prompt returns undefined when cancelled', async () => {
    const prompt = createPrompt([undefined]);

    const result = await prompt.confirm('Confirm?');
    assert.strictEqual(result, undefined);
  });

  it('select prompt returns value', async () => {
    const prompt = createPrompt(['choice1']);

    const result = await prompt.select('Select one', [
      { title: 'Choice 1', value: 'choice1' },
      { title: 'Choice 2', value: 'choice2' },
    ]);
    assert.strictEqual(result, 'choice1');
  });

  it('select prompt returns undefined when cancelled', async () => {
    const prompt = createPrompt([undefined]);

    const result = await prompt.select('Select one', [{ title: 'Choice 1', value: 'choice1' }]);
    assert.strictEqual(result, undefined);
  });

  it('multiselect prompt returns value', async () => {
    const prompt = createPrompt([['c1', 'c2']]);

    const result = await prompt.multiselect('Select many', [
      { title: 'C1', value: 'c1' },
      { title: 'C2', value: 'c2' },
    ]);
    assert.deepStrictEqual(result, ['c1', 'c2']);
  });

  it('multiselect prompt returns undefined when cancelled', async () => {
    const prompt = createPrompt([undefined]);

    const result = await prompt.multiselect('Select many', [{ title: 'C1', value: 'c1' }]);
    assert.strictEqual(result, undefined);
  });

  it('autocomplete prompt returns value', async () => {
    const prompt = createPrompt(['match']);

    const result = await prompt.autocomplete('Find', ['match', 'other']);
    assert.strictEqual(result, 'match');
  });

  it('autocomplete prompt returns undefined when cancelled', async () => {
    const prompt = createPrompt([undefined]);

    const result = await prompt.autocomplete('Find', ['match']);
    assert.strictEqual(result, undefined);
  });

  it('spinner methods', () => {
    const prompt = new GOPrompt(logger);
    prompt.startSpinner('Spinning');
    assert.strictEqual(prompt.isSpinnerActive(), true);
    prompt.updateSpinner('Updated');
    prompt.stopSpinner();
    assert.strictEqual(prompt.isSpinnerActive(), false);

    prompt.startSpinner('Spinning');
    prompt.spinnerStop('Stopped');
    assert.strictEqual(prompt.isSpinnerActive(), false);

    prompt.startSpinner('Spinning');
    prompt.spinnerSucceed('Success');
    assert.strictEqual(prompt.isSpinnerActive(), false);

    prompt.startSpinner('Spinning');
    prompt.spinnerFail('Fail');
    assert.strictEqual(prompt.isSpinnerActive(), false);

    prompt.startSpinner('Spinning');
    prompt.spinnerWarn('Warn');
    assert.strictEqual(prompt.isSpinnerActive(), false);

    prompt.startSpinner('Spinning');
    prompt.spinnerInfo('Info');
    assert.strictEqual(prompt.isSpinnerActive(), false);
  });

  it('multi-spinner methods', () => {
    const prompt = new GOPrompt(logger);
    prompt.spin('task1', 'Task 1');
    assert.strictEqual(prompt.isSpinnerActive(), true);
    prompt.spinSucceed('task1', 'Task 1 Done');
    assert.strictEqual(prompt.isSpinnerActive(), false);

    prompt.spin('task1', 'Task 1');
    prompt.spinFail('task1', 'Task 1 Fail');
    assert.strictEqual(prompt.isSpinnerActive(), false);

    prompt.spin('task1', 'Task 1');
    prompt.spinWarn('task1', 'Task 1 Warn');
    assert.strictEqual(prompt.isSpinnerActive(), false);

    prompt.spin('task1', 'Task 1');
    prompt.spinInfo('task1', 'Task 1 Info');
    assert.strictEqual(prompt.isSpinnerActive(), false);

    prompt.spin('task1', 'Task 1');
    prompt.spinRemove('task1');
    assert.strictEqual(prompt.isSpinnerActive(), false);

    prompt.spinLog('Log message');
  });

  it('loading bar methods', () => {
    const prompt = new GOPrompt(logger);
    prompt.startLoading('Loading');
    assert.strictEqual(prompt.isLoadingActive(), true);
    prompt.updateLoading(50, 'Halfway');
    prompt.completeLoading('Finished');
    // completeLoading uses setTimeout, but we just check internal call was made
    prompt.failLoading('Error');
    assert.strictEqual(prompt.isLoadingActive(), false);

    prompt.startLoading('Loading');
    prompt.stopLoading();
    assert.strictEqual(prompt.isLoadingActive(), false);
  });

  it('utility methods', () => {
    const prompt = new GOPrompt(logger);
    prompt.setSpinnerIndent(4);
    prompt.setSpinnerIndent('    ');
    assert.ok(true);
  });
});

/** Fixed reference instant, so relative answers are deterministic. */
const NOW = new Date('2026-08-24T10:00:00.000Z');

interface DateHarness {
  readonly prompt: GOPrompt;
  /** Options each text prompt was created with, in order. */
  readonly asked: ReadonlyArray<GOPromptInputOptions>;
  /** Titles offered by each select prompt, in order. */
  readonly offered: ReadonlyArray<ReadonlyArray<string>>;
}

/**
 * Builds a prompt whose adapter answers from a queue and records what it was
 * asked, so the validation passed to the adapter can be exercised directly.
 */
function createDatePrompt(values: unknown[]): DateHarness {
  const asked: GOPromptInputOptions[] = [];
  const offered: string[][] = [];
  const next = <T>(): T | undefined => values.shift() as T | undefined;

  const adapter: GOPromptAdapter = {
    text: async (options) => {
      asked.push(options);
      return next();
    },
    password: async () => next(),
    number: async () => next(),
    confirm: async () => next(),
    select: async (options) => {
      offered.push(options.choices.map((choice) => choice.name));
      return next();
    },
    checkbox: async () => next(),
    search: async () => next(),
  };

  return { prompt: new GOPrompt(logger, false, adapter), asked, offered };
}

/** Runs the validation the adapter was handed for the last question asked. */
function validateLast(asked: ReadonlyArray<GOPromptInputOptions>, answer: string): boolean | string {
  const last = asked[asked.length - 1];
  assert.ok(last?.validate !== undefined, 'prompt was created without validation');
  return last.validate(answer);
}

describe('GOPrompt.date', () => {
  it('parses a lenient answer into a Date', async () => {
    const { prompt } = createDatePrompt(['-7d']);

    const result = await prompt.date('Start date', { now: NOW });
    assert.strictEqual(result?.toISOString(), '2026-08-17T10:00:00.000Z');
  });

  it('resolves a day to the requested edge of the day', async () => {
    const { prompt } = createDatePrompt(['24/08/2026', '24/08/2026']);

    const from = await prompt.date('From', { now: NOW, boundary: 'start' });
    const to = await prompt.date('To', { now: NOW, boundary: 'end' });

    assert.strictEqual(from?.toISOString(), '2026-08-24T00:00:00.000Z');
    assert.strictEqual(to?.toISOString(), '2026-08-24T23:59:59.999Z');
  });

  it('returns undefined when cancelled or left empty', async () => {
    const { prompt } = createDatePrompt([undefined, '   ']);

    assert.strictEqual(await prompt.date('Start date'), undefined);
    assert.strictEqual(await prompt.date('Start date', { allowEmpty: true }), undefined);
  });

  it('prefills a Date as editable ISO 8601 text', async () => {
    const { prompt, asked } = createDatePrompt(['now']);

    await prompt.date('Start date', { now: NOW, initial: NOW });
    assert.strictEqual(asked[0]?.default, '2026-08-24T10:00:00.000Z');
  });

  it('rejects an unparseable answer, naming the accepted formats', async () => {
    const { prompt, asked } = createDatePrompt(['now']);
    await prompt.date('Start date', { now: NOW });

    const outcome = validateLast(asked, 'domani');
    assert.ok(typeof outcome === 'string' && outcome.includes('-7d'), outcome as string);
  });

  it('accepts an empty answer only when allowed', async () => {
    const { prompt, asked } = createDatePrompt(['now', 'now']);

    await prompt.date('Start date', { now: NOW });
    assert.strictEqual(validateLast(asked, ''), 'A date is required');

    await prompt.date('Start date', { now: NOW, allowEmpty: true });
    assert.strictEqual(validateLast(asked, ''), true);
  });

  it('enforces the min and max bounds', async () => {
    const { prompt, asked } = createDatePrompt(['now']);
    await prompt.date('End date', {
      now: NOW,
      min: new Date('2026-08-20T00:00:00.000Z'),
      max: new Date('2026-08-25T00:00:00.000Z'),
    });

    assert.match(String(validateLast(asked, '2026-08-19')), /on or after/);
    assert.match(String(validateLast(asked, '2026-08-26')), /on or before/);
    assert.strictEqual(validateLast(asked, '2026-08-22'), true);
  });

  it('delegates to the caller validation once the date is parsed', async () => {
    const { prompt, asked } = createDatePrompt(['now']);
    await prompt.date('Start date', {
      now: NOW,
      validate: (value) => (value.getUTCHours() === 0 ? true : 'Whole days only'),
    });

    assert.strictEqual(validateLast(asked, '2026-08-22'), true);
    assert.strictEqual(validateLast(asked, '2026-08-22 14:30'), 'Whole days only');
  });
});

describe('GOPrompt.dateRange', () => {
  it('computes both bounds from the chosen preset', async () => {
    const { prompt, offered } = createDatePrompt([1]);

    const range = await prompt.dateRange('Period', { now: NOW });

    assert.deepStrictEqual(offered[0], [
      'Last 24 hours',
      'Last 7 days',
      'Last 30 days',
      'Current month',
      'No limit',
      'Custom…',
    ]);
    assert.strictEqual(range?.from?.toISOString(), '2026-08-17T10:00:00.000Z');
    assert.strictEqual(range?.to?.toISOString(), '2026-08-24T10:00:00.000Z');
  });

  it('resolves the current month in the requested time zone', async () => {
    const { prompt } = createDatePrompt([3]);

    const range = await prompt.dateRange('Period', { now: NOW, timeZone: 'Europe/Rome' });
    assert.strictEqual(range?.from?.toISOString(), '2026-07-31T22:00:00.000Z');
  });

  it('leaves both bounds unset on the unbounded preset', async () => {
    const { prompt } = createDatePrompt([4]);

    const range = await prompt.dateRange('Period', { now: NOW });
    assert.deepStrictEqual(range, {});
  });

  it('asks for both bounds on the custom preset, bounding the second by the first', async () => {
    const { prompt, asked } = createDatePrompt([5, '2026-08-20', '2026-08-22']);

    const range = await prompt.dateRange('Period', { now: NOW });

    assert.strictEqual(range?.from?.toISOString(), '2026-08-20T00:00:00.000Z');
    assert.strictEqual(range?.to?.toISOString(), '2026-08-22T23:59:59.999Z');
    assert.match(String(validateLast(asked, '2026-08-19')), /on or after 2026-08-20/);
  });

  it('treats an empty custom bound as unbounded', async () => {
    const { prompt } = createDatePrompt([5, '', '']);

    const range = await prompt.dateRange('Period', { now: NOW });
    assert.deepStrictEqual(range, {});
  });

  it('returns undefined when the preset selection is cancelled', async () => {
    const { prompt } = createDatePrompt([undefined]);

    assert.strictEqual(await prompt.dateRange('Period', { now: NOW }), undefined);
  });

  it('honours caller-supplied presets', async () => {
    const { prompt, offered } = createDatePrompt([0]);

    const range = await prompt.dateRange('Periodo', {
      now: NOW,
      presets: [{ title: 'Ultime 2 ore', from: (now) => new Date(now.getTime() - 7_200_000) }],
    });

    assert.deepStrictEqual(offered[0], ['Ultime 2 ore']);
    assert.strictEqual(range?.from?.toISOString(), '2026-08-24T08:00:00.000Z');
    assert.strictEqual(range?.to, undefined);
  });
});
