/**
 * Tests of the production write gate.
 *
 * The property under test is that nothing but a human typing the target can
 * get a production write past it: not `--yes`, not a missing terminal.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOLogger } from '@pagopa/go-common/logging';
import {
  confirmProductionWrite,
  confirmWriteWithProduction,
  GO_PROD_WRITE_NEEDS_OPERATOR,
} from '../confirmProductionWrite.js';
import type { GOPromptTextValidator } from '../GOPrompt.js';
import { GOPrompt } from '../GOPrompt.js';

/** What the fake prompt was asked. */
interface PromptRecord {
  confirms: number;
  texts: string[];
  validators: GOPromptTextValidator[];
}

/**
 * Builds a prompt that answers without a terminal.
 *
 * @param confirmAnswer - What `confirm` resolves to
 * @param typed - What `text` resolves to, in order; the validator is applied the way a terminal would
 * @returns The fake prompt and what it was asked
 */
function fakePrompt(
  confirmAnswer: boolean | undefined,
  typed: ReadonlyArray<string | undefined>,
): { prompt: GOPrompt; record: PromptRecord } {
  const record: PromptRecord = { confirms: 0, texts: [], validators: [] };
  const answers = [...typed];
  const prompt = {
    confirm: async (): Promise<boolean | undefined> => {
      record.confirms += 1;
      return await Promise.resolve(confirmAnswer);
    },
    text: async (message: string, options?: { validate?: GOPromptTextValidator }): Promise<string | undefined> => {
      record.texts.push(message);
      await Promise.resolve();
      if (options?.validate !== undefined) record.validators.push(options.validate);
      // A terminal re-asks until the validator passes; the fake skips the rejected answers the same way.
      while (answers.length > 0) {
        const answer = answers.shift();
        if (answer === undefined) return undefined;
        if (options?.validate?.(answer) === true) return answer;
      }
      return undefined;
    },
  } as unknown as GOPrompt;

  return { prompt, record };
}

const logger = { info: () => undefined, warning: () => undefined } as unknown as GOLogger;

const prodProfile = { label: 'sso_pn-core-prod', profile: 'sso_pn-core-prod' };
const devProfile = { label: 'sso_pn-core-dev', profile: 'sso_pn-core-dev' };

describe('confirmWriteWithProduction', () => {
  it('asks one question when no target is production', async () => {
    const { prompt, record } = fakePrompt(true, []);

    const approved = await confirmWriteWithProduction(prompt, logger, {
      question: 'PURGE?',
      targets: [devProfile],
      assumeYes: false,
      isDryRun: false,
      canPromptUser: true,
    });

    assert.equal(approved, true);
    assert.equal(record.confirms, 1);
    assert.equal(record.texts.length, 0);
  });

  it('still asks for the typed target on production when --yes was given', async () => {
    const { prompt, record } = fakePrompt(undefined, ['sso_pn-core-prod']);

    const approved = await confirmWriteWithProduction(prompt, logger, {
      question: 'PURGE?',
      targets: [prodProfile, devProfile],
      assumeYes: true,
      isDryRun: false,
      canPromptUser: true,
    });

    assert.equal(approved, true);
    assert.equal(record.confirms, 0, '--yes answers the first question');
    assert.equal(record.texts.length, 1, 'only the production target is typed back');
    assert.match(record.texts[0] ?? '', /sso_pn-core-prod/);
  });

  it('stops at the first gate when the operator declines it', async () => {
    const { prompt, record } = fakePrompt(false, ['sso_pn-core-prod']);

    const approved = await confirmWriteWithProduction(prompt, logger, {
      question: 'PURGE?',
      targets: [prodProfile],
      assumeYes: false,
      isDryRun: false,
      canPromptUser: true,
    });

    assert.equal(approved, false);
    assert.equal(record.texts.length, 0);
  });

  it('throws on a production target with no terminal, even with --yes', async () => {
    const { prompt } = fakePrompt(undefined, []);

    await assert.rejects(
      async () =>
        await confirmWriteWithProduction(prompt, logger, {
          question: 'PURGE?',
          targets: [prodProfile],
          assumeYes: true,
          isDryRun: false,
          canPromptUser: false,
        }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, GO_PROD_WRITE_NEEDS_OPERATOR);
        return true;
      },
    );
  });
});

describe('confirmWriteWithProduction, a target whose account could not be resolved', () => {
  it('says the account was not resolved instead of calling the target production', async () => {
    const { prompt } = fakePrompt(undefined, []);

    await assert.rejects(
      async () =>
        await confirmWriteWithProduction(prompt, logger, {
          question: 'PURGE?',
          targets: [{ label: 'team-alias', profile: 'team-alias', isProduction: true, unresolved: true }],
          assumeYes: true,
          isDryRun: false,
          canPromptUser: false,
        }),
      /team-alias \(account not resolved\)/,
    );
  });
});

describe('confirmProductionWrite', () => {
  it('re-asks on a wrong answer and accepts the exact label', async () => {
    const { prompt, record } = fakePrompt(true, ['sso_pn-core-dev', 'sso_pn-core-prod']);

    const approved = await confirmProductionWrite(prompt, logger, {
      question: 'PURGE?',
      targets: [prodProfile],
      isDryRun: false,
      canPromptUser: true,
    });

    assert.equal(approved, true);
    const validate = record.validators[0];
    assert.ok(validate !== undefined);
    assert.match(String(validate('sso_pn-core-dev')), /Type exactly/);
    assert.equal(validate(' sso_pn-core-prod '), true);
  });

  it('returns false when the operator presses Esc', async () => {
    const { prompt } = fakePrompt(true, [undefined]);

    assert.equal(
      await confirmProductionWrite(prompt, logger, {
        question: 'PURGE?',
        targets: [prodProfile],
        isDryRun: false,
        canPromptUser: true,
      }),
      false,
    );
  });

  it('asks nothing on a dry run, because nothing is written', async () => {
    const { prompt, record } = fakePrompt(undefined, []);

    assert.equal(
      await confirmProductionWrite(prompt, logger, {
        question: 'PURGE?',
        targets: [prodProfile],
        isDryRun: true,
        canPromptUser: false,
      }),
      true,
    );
    assert.equal(record.texts.length, 0);
  });
});
