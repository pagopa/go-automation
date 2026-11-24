/**
 * Tests of `confirmWrite`.
 *
 * The case that matters is the one three scripts had wrong: a real write, no
 * terminal, no `--yes`. Returning `false` there is what let a run report
 * success for work it never did, so the test asserts it throws rather than
 * asserting any particular return value.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOLogger } from '@pagopa/go-common/logging';
import { confirmWrite, GO_WRITE_NEEDS_CONFIRMATION } from '../confirmWrite.js';
import { GOPrompt } from '../GOPrompt.js';

/** Lines a fake logger collected. */
interface CapturedLogs {
  readonly info: string[];
  readonly warning: string[];
}

/**
 * Builds a logger that records instead of printing.
 *
 * @returns The fake logger and the lines it captured
 */
function fakeLogger(): { logger: GOLogger; logs: CapturedLogs } {
  const logs: CapturedLogs = { info: [], warning: [] };
  const logger = {
    info: (message: string) => logs.info.push(message),
    warning: (message: string) => logs.warning.push(message),
  } as unknown as GOLogger;

  return { logger, logs };
}

/** How many times the fake prompt was asked. */
interface AskCount {
  count: number;
}

/**
 * Builds a prompt that answers without a terminal.
 *
 * @param answer - What `confirm` should resolve to
 * @returns The fake prompt and how many times it was asked
 */
function fakePrompt(answer: boolean | undefined): { prompt: GOPrompt; asked: AskCount } {
  const asked: AskCount = { count: 0 };
  const prompt = {
    confirm: async (): Promise<boolean | undefined> => {
      asked.count += 1;
      return await Promise.resolve(answer);
    },
  } as unknown as GOPrompt;

  return { prompt, asked };
}

describe('confirmWrite', () => {
  it('refuses to let a real write pass unconfirmed when there is nobody to ask', async () => {
    const { logger } = fakeLogger();
    const { prompt, asked } = fakePrompt(undefined);

    await assert.rejects(
      async () =>
        await confirmWrite(prompt, logger, {
          question: 'WRITE the 2 parameter(s)?',
          assumeYes: false,
          isDryRun: false,
          canPromptUser: false,
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /--yes/);
        assert.equal((error as { code?: string }).code, GO_WRITE_NEEDS_CONFIRMATION);
        return true;
      },
    );

    assert.equal(asked.count, 0, 'it must not ask a terminal that is not there');
  });

  it('lets a dry run proceed with no terminal, because it writes nothing', async () => {
    const { logger, logs } = fakeLogger();
    const { prompt, asked } = fakePrompt(undefined);

    const approved = await confirmWrite(prompt, logger, {
      question: 'WRITE the 2 parameter(s)?',
      assumeYes: false,
      isDryRun: true,
      canPromptUser: false,
    });

    assert.equal(approved, true);
    assert.equal(asked.count, 0);
    assert.match(logs.info.join(' '), /writes nothing/);
  });

  it('approves without asking when --yes was given', async () => {
    const { logger } = fakeLogger();
    const { prompt, asked } = fakePrompt(undefined);

    assert.equal(
      await confirmWrite(prompt, logger, {
        question: 'WRITE?',
        assumeYes: true,
        isDryRun: false,
        canPromptUser: false,
      }),
      true,
    );
    assert.equal(asked.count, 0);
  });

  it('treats a cancelled prompt as a refusal, not as approval', async () => {
    const { logger, logs } = fakeLogger();
    const { prompt } = fakePrompt(undefined);

    assert.equal(
      await confirmWrite(prompt, logger, {
        question: 'WRITE?',
        assumeYes: false,
        isDryRun: false,
        canPromptUser: true,
      }),
      false,
    );
    assert.match(logs.warning.join(' '), /cancelled/);
  });

  it('approves when a human answers yes', async () => {
    const { logger } = fakeLogger();
    const { prompt, asked } = fakePrompt(true);

    assert.equal(
      await confirmWrite(prompt, logger, {
        question: 'WRITE?',
        assumeYes: false,
        isDryRun: false,
        canPromptUser: true,
      }),
      true,
    );
    assert.equal(asked.count, 1);
  });
});
