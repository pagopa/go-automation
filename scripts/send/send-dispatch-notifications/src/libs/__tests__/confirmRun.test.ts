import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Core } from '@go-automation/go-common';

import { confirmRun, exitCodeForConfirmation } from '../confirmRun.js';
import { FakeLogger, FakePrompt } from './helpers/testScript.js';

function script(answer: boolean | undefined): {
  logger: FakeLogger;
  prompt: FakePrompt;
  double: Pick<Core.GOScript, 'logger' | 'prompt'>;
} {
  const logger = new FakeLogger();
  const prompt = new FakePrompt(answer);
  return { logger, prompt, double: { logger, prompt } as unknown as Pick<Core.GOScript, 'logger' | 'prompt'> };
}

const SEND_5 = { rows: 5, sending: true };
const PROCESS_7 = { rows: 7, sending: false };

describe('confirmRun', () => {
  it('outside production: --yes skips the prompt, otherwise the answer decides', async () => {
    const yes = script(false);
    assert.equal(await confirmRun(yes.double, { yes: true }, { production: false }, SEND_5), 'CONFIRMED');
    assert.deepEqual(yes.prompt.questions, []);

    const asked = script(true);
    assert.equal(await confirmRun(asked.double, { yes: false }, { production: false }, SEND_5), 'CONFIRMED');
    assert.deepEqual(asked.prompt.questions, ['Inviare 5 notifiche?']);

    assert.equal(await confirmRun(script(false).double, { yes: false }, { production: false }, SEND_5), 'DECLINED');
    assert.equal(await confirmRun(script(undefined).double, { yes: false }, { production: false }, SEND_5), 'DECLINED');
  });

  it('in production requires --confirm-production equal to the rows to send, and the prompt', async () => {
    const missing = script(true);
    assert.equal(await confirmRun(missing.double, { yes: true }, { production: true }, SEND_5), 'NOT_CONFIRMED');
    assert.match(missing.logger.of('error')[0] ?? '', /--confirm-production=5 \(numero di righe da inviare\)/);
    assert.deepEqual(missing.prompt.questions, []);

    const wrong = script(true);
    assert.equal(
      await confirmRun(wrong.double, { yes: true, confirmProduction: 4 }, { production: true }, SEND_5),
      'NOT_CONFIRMED',
    );

    const right = script(true);
    assert.equal(
      await confirmRun(right.double, { yes: true, confirmProduction: 5 }, { production: true }, SEND_5),
      'CONFIRMED',
    );
    assert.deepEqual(right.prompt.questions, ['Inviare 5 notifiche IN PRODUZIONE?']);

    const declined = script(false);
    assert.equal(
      await confirmRun(declined.double, { yes: false, confirmProduction: 5 }, { production: true }, SEND_5),
      'DECLINED',
    );
  });

  it('counts the rows to process when the session sends nothing', async () => {
    const missing = script(true);
    assert.equal(await confirmRun(missing.double, { yes: false }, { production: true }, PROCESS_7), 'NOT_CONFIRMED');
    assert.match(missing.logger.of('error')[0] ?? '', /--confirm-production=7 \(numero di righe da elaborare\)/);

    const asked = script(true);
    await confirmRun(asked.double, { yes: false }, { production: false }, PROCESS_7);
    assert.deepEqual(asked.prompt.questions, ['Elaborare 7 righe (nessun invio)?']);
  });

  it('maps the outcomes to exit codes', () => {
    assert.equal(exitCodeForConfirmation('NOT_CONFIRMED'), 1);
    assert.equal(exitCodeForConfirmation('DECLINED'), 3);
  });
});
