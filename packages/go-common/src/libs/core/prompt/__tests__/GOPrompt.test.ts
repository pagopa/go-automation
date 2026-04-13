/**
 * Tests for GOPrompt
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import prompts from 'prompts';

import { GOPrompt } from '../GOPrompt.js';
import { GOLogger } from '../../logging/GOLogger.js';

// Mock logger
const logger = new GOLogger('test');

describe('GOPrompt', () => {
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
    
    const result = await prompt.select('Select one', [
      { title: 'Choice 1', value: 'choice1' },
    ]);
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
    
    const result = await prompt.multiselect('Select many', [
      { title: 'C1', value: 'c1' },
    ]);
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
});
