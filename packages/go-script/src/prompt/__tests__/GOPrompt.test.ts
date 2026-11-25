/**
 * Tests for GOPrompt
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  GO_PROMPT_BACK,
  GOPrompt,
  type GOPromptAdapter,
  type GOPromptInputOptions,
  type GOPromptSelectInputOptions,
} from '../GOPrompt.js';
import { GOPromptInterruptedError } from '../GOPromptInterruptedError.js';
import { GOLogger } from '@pagopa/go-common/logging';

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

  it('returns the answer of every prompt, or undefined when it is cancelled', async () => {
    const prompts: ReadonlyArray<readonly [string, (prompt: GOPrompt) => Promise<unknown>, unknown]> = [
      ['text', async (prompt) => prompt.text('Enter text'), 'test value'],
      ['password', async (prompt) => prompt.password('Enter password'), 'secret'],
      ['number', async (prompt) => prompt.number('Enter number'), 7],
      ['confirm', async (prompt) => prompt.confirm('Confirm?'), true],
      [
        'select',
        async (prompt) =>
          prompt.select('Select one', [
            { title: 'Choice 1', value: 'choice1' },
            { title: 'Choice 2', value: 'choice2' },
          ]),
        'choice1',
      ],
      [
        'multiselect',
        async (prompt) =>
          prompt.multiselect('Select many', [
            { title: 'C1', value: 'c1' },
            { title: 'C2', value: 'c2' },
          ]),
        ['c1', 'c2'],
      ],
      ['autocomplete', async (prompt) => prompt.autocomplete('Find', ['match', 'other']), 'match'],
    ];

    for (const [name, ask, answer] of prompts) {
      assert.deepStrictEqual(await ask(createPrompt([answer])), answer, name);
      assert.strictEqual(await ask(createPrompt([undefined])), undefined, `${name} cancelled`);
    }
  });

  it('starts and ends the spinner through every terminal method, honouring the indent', () => {
    const prompt = new GOPrompt(logger);
    prompt.setSpinnerIndent(2);
    const ends: ReadonlyArray<(prompt: GOPrompt) => void> = [
      (p) => p.stopSpinner(),
      (p) => p.spinnerStop('Stopped'),
      (p) => p.spinnerSucceed('Success'),
      (p) => p.spinnerFail('Fail'),
      (p) => p.spinnerWarn('Warn'),
      (p) => p.spinnerInfo('Info'),
    ];

    for (const end of ends) {
      prompt.startSpinner('Spinning');
      assert.strictEqual(prompt.isSpinnerActive(), true);
      prompt.updateSpinner('Updated');
      end(prompt);
      assert.strictEqual(prompt.isSpinnerActive(), false);
    }
    // Under test stdout is not a TTY, so the spinner writes plain indented lines.
    assert.ok(stdoutWriteMock.mock.calls.some((call) => String(call.arguments[0]) === '  Spinning\n'));
  });

  it('starts and ends a multi-spinner task through every terminal method', () => {
    const prompt = new GOPrompt(logger);
    const ends: ReadonlyArray<(prompt: GOPrompt) => void> = [
      (p) => p.spinSucceed('task1', 'Task 1 Done'),
      (p) => p.spinFail('task1', 'Task 1 Fail'),
      (p) => p.spinWarn('task1', 'Task 1 Warn'),
      (p) => p.spinInfo('task1', 'Task 1 Info'),
      (p) => p.spinRemove('task1'),
    ];

    for (const end of ends) {
      prompt.spin('task1', 'Task 1');
      assert.strictEqual(prompt.isSpinnerActive(), true);
      end(prompt);
      assert.strictEqual(prompt.isSpinnerActive(), false);
    }
    prompt.spinLog('Log message');
    assert.ok(stdoutWriteMock.mock.calls.some((call) => String(call.arguments[0]).includes('Log message')));
  });

  it('starts and ends the loading bar through complete, fail and stop', (t) => {
    // completeLoading lets 100% show for a moment before stopping.
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const prompt = new GOPrompt(logger);
    const ends: ReadonlyArray<(prompt: GOPrompt) => void> = [
      (p) => {
        p.completeLoading('Finished');
        t.mock.timers.tick(100);
      },
      (p) => p.failLoading('Error'),
      (p) => p.stopLoading(),
    ];

    for (const end of ends) {
      prompt.startLoading('Loading');
      assert.strictEqual(prompt.isLoadingActive(), true);
      prompt.updateLoading(50, 'Halfway');
      end(prompt);
      assert.strictEqual(prompt.isLoadingActive(), false);
    }
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

/** Rejection raised by inquirer once the prompt is aborted through its signal. */
function abortError(): Error {
  const error = new Error('Prompt was aborted');
  error.name = 'AbortPromptError';
  return error;
}

describe('selectWithBack', () => {
  const choices = [
    { title: 'Produzione', value: 'prod' },
    { title: '← Indietro', value: 'back' },
  ];

  /**
   * Prompt whose select answers `answer`, after emitting `keys` on stdin the way
   * readline does while the prompt is on screen.
   */
  function createBackPrompt(answer: unknown, keys: ReadonlyArray<string> = []): { prompt: GOPrompt } {
    const unused = async <T>(): Promise<T | undefined> => await Promise.resolve(undefined);
    const adapter: GOPromptAdapter = {
      text: unused,
      password: unused,
      number: unused,
      confirm: unused,
      select: async <T>(_options: unknown, context?: { readonly signal?: AbortSignal }): Promise<T | undefined> => {
        for (const name of keys) process.stdin.emit('keypress', '', { name });
        if (context?.signal?.aborted === true) throw abortError();
        return await Promise.resolve(answer as T);
      },
      checkbox: unused,
      search: unused,
    };

    return { prompt: new GOPrompt(logger, false, adapter) };
  }

  it('returns the answer, the back sentinel on ←, or undefined when cancelled, leaving no keypress listener', async () => {
    const cases: ReadonlyArray<readonly [ReadonlyArray<string>, unknown, unknown]> = [
      [[], 'prod', 'prod'],
      [['left'], 'prod', GO_PROMPT_BACK],
      [['right', 'down', 'backspace'], 'prod', 'prod'],
      [[], undefined, undefined],
    ];
    const before = process.stdin.listenerCount('keypress');

    for (const [keys, answer, expected] of cases) {
      const { prompt } = createBackPrompt(answer, keys);

      assert.strictEqual(await prompt.selectWithBack<string>('Ambiente', choices), expected, keys.join());
      assert.strictEqual(process.stdin.listenerCount('keypress'), before);
    }
  });
});

describe('autocompleteWithBack', () => {
  const choices = [
    { title: 'Produzione', value: 'prod' },
    { title: '← Indietro', value: 'back' },
  ];

  /**
   * Prompt whose search answers `answer`, after running the filter through every
   * `queries` entry the way typing does, then emitting `keys` on stdin.
   */
  function createSearchPrompt(answer: unknown, queries: ReadonlyArray<string>, keys: ReadonlyArray<string>): GOPrompt {
    const unused = async <T>(): Promise<T | undefined> => await Promise.resolve(undefined);
    const search = async <T>(
      options: GOPromptSelectInputOptions<T>,
      context?: { readonly signal?: AbortSignal },
    ): Promise<T | undefined> => {
      for (const query of queries) await options.source?.(query);
      for (const name of keys) process.stdin.emit('keypress', '', { name });
      if (context?.signal?.aborted === true) throw abortError();
      return answer as T;
    };

    const adapter: GOPromptAdapter = {
      text: unused,
      password: unused,
      number: unused,
      confirm: unused,
      select: unused,
      checkbox: unused,
      search: search,
    };

    return new GOPrompt(logger, false, adapter);
  }

  it('goes back on ← only while the filter is empty, leaving no keypress listener', async () => {
    const cases: ReadonlyArray<readonly [string, ReadonlyArray<string>, ReadonlyArray<string>, unknown]> = [
      ['no shortcut', [''], [], 'prod'],
      ['← on an empty filter', [''], ['left'], GO_PROMPT_BACK],
      ['← once the user has typed', ['', 'pro'], ['left'], 'prod'],
      ['← once the filter is cleared again', ['', 'pro', ''], ['left'], GO_PROMPT_BACK],
    ];
    const before = process.stdin.listenerCount('keypress');

    for (const [name, queries, keys, expected] of cases) {
      const prompt = createSearchPrompt('prod', queries, keys);

      assert.strictEqual(await prompt.autocompleteWithBack<string>('Runbook', choices), expected, name);
      assert.strictEqual(process.stdin.listenerCount('keypress'), before, name);
    }
  });

  it('still filters through the suggestions of the caller', async () => {
    const seen: string[] = [];
    const prompt = createSearchPrompt('prod', ['pro'], []);

    await prompt.autocompleteWithBack<string>('Runbook', choices, {
      suggest: async (input, all) => {
        seen.push(input);
        return await Promise.resolve(all.filter((choice) => choice.title.includes(input)));
      },
    });

    assert.deepStrictEqual(seen, ['pro']);
  });
});

describe('GOPrompt.dateRangeWithBack', () => {
  /** Value carried by the "go back" entry, past the last preset. */
  const backValue = -1;

  it('offers the way back after the presets, named in English unless the caller says otherwise', async () => {
    for (const [backLabel, expected] of [
      ['← Back to the runbook', '← Back to the runbook'],
      [undefined, '← Back'],
    ] as const) {
      const { prompt, offered } = createDatePrompt([0]);

      await prompt.dateRangeWithBack('Period', { now: NOW, ...(backLabel !== undefined ? { backLabel } : {}) });

      assert.deepStrictEqual(offered[0]?.slice(-2), ['Custom…', expected]);
    }
  });

  it('returns the sentinel when the way back is picked', async () => {
    const { prompt } = createDatePrompt([backValue]);

    assert.strictEqual(await prompt.dateRangeWithBack('Period', { now: NOW }), GO_PROMPT_BACK);
  });

  it('resolves the presets exactly like the plain picker', async () => {
    const { prompt } = createDatePrompt([1]);

    const range = await prompt.dateRangeWithBack('Period', { now: NOW });

    assert.notStrictEqual(range, GO_PROMPT_BACK);
    assert.strictEqual(range === GO_PROMPT_BACK ? undefined : range?.from?.toISOString(), '2026-08-17T10:00:00.000Z');
  });

  it('leaves the plain picker without a way back', async () => {
    const { prompt, offered } = createDatePrompt([0]);

    await prompt.dateRange('Period', { now: NOW, backLabel: '← Back' });

    assert.ok(!(offered[0] ?? []).includes('← Back'));
  });
});

/** How a test delivers Ctrl+C to an open prompt. */
type InterruptFn = () => void;

describe('Ctrl+C on a prompt', () => {
  /** Error inquirer rejects with when its prompt is closed by Ctrl+C. */
  function exitPromptError(): Error {
    const error = new Error('User force closed the prompt with SIGINT');
    error.name = 'ExitPromptError';
    return error;
  }

  /** Prompt whose every method runs `interrupt` (the way Ctrl+C reaches it) and then rejects like inquirer. */
  function createInterruptedPrompt(interrupt: InterruptFn): GOPrompt {
    const fail = async (): Promise<never> => {
      interrupt();
      return await Promise.reject(exitPromptError());
    };
    const adapter: GOPromptAdapter = {
      text: fail,
      password: fail,
      number: fail,
      confirm: fail,
      select: fail,
      checkbox: fail,
      search: fail,
    };
    return new GOPrompt(logger, false, adapter);
  }

  /**
   * Delivers a signal only to the listeners the prompt installed after `runnerListeners`
   * were taken: emitting it on the process would also reach the test runner.
   */
  function signalPrompt(signal: NodeJS.Signals, runnerListeners: ReadonlySet<unknown>): void {
    const added = process.listeners(signal).filter((listener) => !runnerListeners.has(listener));
    assert.ok(added.length > 0, `the prompt must listen to ${signal}`);
    for (const listener of added) listener(signal);
  }

  const pressCtrlC: InterruptFn = () => {
    process.stdin.emit('keypress', '\u0003', { ctrl: true, name: 'c' });
  };

  it('throws GOPromptInterruptedError instead of exiting the process', async (t) => {
    const exit = t.mock.method(process, 'exit', (): never => undefined as never);
    const prompt = createInterruptedPrompt(pressCtrlC);

    await assert.rejects(prompt.confirm('Proceed?', false), (error: unknown) => {
      assert.ok(error instanceof GOPromptInterruptedError);
      assert.strictEqual(error.signal, 'SIGINT');
      assert.strictEqual(error.exitCode, 130);
      return true;
    });
    assert.strictEqual(exit.mock.callCount(), 0);
  });

  it('throws GOPromptInterruptedError from the prompts that offer ←', async () => {
    const prompt = createInterruptedPrompt(pressCtrlC);

    await assert.rejects(
      prompt.selectWithBack<string>('Ambiente', [{ title: 'Produzione', value: 'prod' }]),
      GOPromptInterruptedError,
    );
  });

  it('treats SIGINT during the prompt (stdin not in raw mode) as Ctrl+C', async () => {
    const runnerListeners = new Set(process.listeners('SIGINT'));
    const prompt = createInterruptedPrompt(() => signalPrompt('SIGINT', runnerListeners));

    await assert.rejects(prompt.text('Name'), GOPromptInterruptedError);
  });

  it('still resolves to undefined when the prompt is closed without Ctrl+C', async () => {
    const prompt = createInterruptedPrompt(() => undefined);

    assert.strictEqual(await prompt.text('Name'), undefined);
  });

  it('registers no signal listener when the module is imported', async () => {
    // A fresh process: in this one the module is already loaded.
    const moduleUrl = new URL('../GOPrompt.ts', import.meta.url).href;
    const code = `await import(${JSON.stringify(moduleUrl)}); console.log(['SIGINT', 'SIGTERM', 'SIGQUIT'].map((s) => process.listenerCount(s)).join());`;

    const { stdout } = await promisify(execFile)(process.execPath, [
      '--import',
      'tsx/esm',
      '--input-type=module',
      '-e',
      code,
    ]);

    assert.strictEqual(stdout.trim(), '0,0,0');
  });

  it('listens to SIGINT, SIGTERM and SIGQUIT only while a prompt is open', async () => {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    const before = signals.map((signal) => process.listenerCount(signal));
    let during: number[] = [];
    const prompt = createInterruptedPrompt(() => {
      during = signals.map((signal) => process.listenerCount(signal));
    });

    await prompt.text('Name');

    assert.deepStrictEqual(
      during,
      before.map((count) => count + 1),
    );
    assert.deepStrictEqual(
      signals.map((signal) => process.listenerCount(signal)),
      before,
    );
  });

  it('closes a prompt waiting for input when SIGTERM arrives, with exit code 143', async () => {
    // Like inquirer under GOScript: the prompt never settles by itself on a signal,
    // only when the context signal is aborted.
    const waitForAbort = async (_options: unknown, context?: { readonly signal?: AbortSignal }): Promise<never> =>
      new Promise<never>((_resolve, reject) => {
        context?.signal?.addEventListener('abort', () => {
          const error = new Error('Prompt was aborted');
          error.name = 'AbortPromptError';
          reject(error);
        });
      });
    const adapter: GOPromptAdapter = {
      text: waitForAbort,
      password: waitForAbort,
      number: waitForAbort,
      confirm: waitForAbort,
      select: waitForAbort,
      checkbox: waitForAbort,
      search: waitForAbort,
    };
    const prompt = new GOPrompt(logger, false, adapter);

    const runnerListeners = new Set(process.listeners('SIGTERM'));
    const answer = prompt.confirm('Inviare?', false);
    signalPrompt('SIGTERM', runnerListeners);

    const error = await answer.then(
      () => assert.fail('the prompt must be interrupted'),
      (reason: unknown) => reason,
    );
    assert.ok(error instanceof GOPromptInterruptedError);
    assert.strictEqual(error.signal, 'SIGTERM');
    assert.strictEqual(error.exitCode, 143);
  });
});
