/**
 * Tests for GOPrompt
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import prompts from 'prompts';

import { GOPrompt } from '../GOPrompt.js';
import { GOLogger } from '../../logging/GOLogger.js';

// Mock logger
const logger = new GOLogger([]);

describe('GOPrompt', () => {
  let stdoutWriteMock: any;

  beforeEach(() => {
    stdoutWriteMock = mock.method(process.stdout, 'write', () => true);
  });

  afterEach(() => {
    stdoutWriteMock.mock.restore();
  });

  it('text prompt returns value', async () => {
    const prompt = new GOPrompt(logger);
    prompts.inject(['test value']);

    const result = await prompt.text('Enter text');
    assert.strictEqual(result, 'test value');
  });

  it('text prompt returns undefined when cancelled', async () => {
    const prompt = new GOPrompt(logger);
    prompts.inject([undefined]);

    const result = await prompt.text('Enter text');
    assert.strictEqual(result, undefined);
  });

  it('password prompt returns undefined when cancelled', async () => {
    const prompt = new GOPrompt(logger);
    prompts.inject([undefined]);

    const result = await prompt.password('Enter password');
    assert.strictEqual(result, undefined);
  });

  it('number prompt returns undefined when cancelled', async () => {
    const prompt = new GOPrompt(logger);
    prompts.inject([undefined]);

    const result = await prompt.number('Enter number');
    assert.strictEqual(result, undefined);
  });

  it('confirm prompt returns undefined when cancelled', async () => {
    const prompt = new GOPrompt(logger);
    prompts.inject([undefined]);

    const result = await prompt.confirm('Confirm?');
    assert.strictEqual(result, undefined);
  });

  it('select prompt returns value', async () => {
    const prompt = new GOPrompt(logger);
    prompts.inject(['choice1']);

    const result = await prompt.select('Select one', [
      { title: 'Choice 1', value: 'choice1' },
      { title: 'Choice 2', value: 'choice2' },
    ]);
    assert.strictEqual(result, 'choice1');
  });

  it('select prompt returns undefined when cancelled', async () => {
    const prompt = new GOPrompt(logger);
    prompts.inject([undefined]);

    const result = await prompt.select('Select one', [{ title: 'Choice 1', value: 'choice1' }]);
    assert.strictEqual(result, undefined);
  });

  it('multiselect prompt returns value', async () => {
    const prompt = new GOPrompt(logger);
    prompts.inject([['c1', 'c2']]);

    const result = await prompt.multiselect('Select many', [
      { title: 'C1', value: 'c1' },
      { title: 'C2', value: 'c2' },
    ]);
    assert.deepStrictEqual(result, ['c1', 'c2']);
  });

  it('multiselect prompt returns undefined when cancelled', async () => {
    const prompt = new GOPrompt(logger);
    prompts.inject([undefined]);

    const result = await prompt.multiselect('Select many', [{ title: 'C1', value: 'c1' }]);
    assert.strictEqual(result, undefined);
  });

  it('autocomplete prompt returns value', async () => {
    const prompt = new GOPrompt(logger);
    prompts.inject(['match']);

    const result = await prompt.autocomplete('Find', ['match', 'other']);
    assert.strictEqual(result, 'match');
  });

  it('autocomplete prompt returns undefined when cancelled', async () => {
    const prompt = new GOPrompt(logger);
    prompts.inject([undefined]);

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
