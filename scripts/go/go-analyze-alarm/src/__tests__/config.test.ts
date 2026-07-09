import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { scriptParameters } from '../config.js';

describe('go-analyze-alarm config', () => {
  it('declares analysis.mode as the only new analysis parameter with single default', () => {
    const analysisParameters = scriptParameters.filter((parameter) => parameter.name.startsWith('analysis.'));
    assert.deepStrictEqual(
      analysisParameters.map((parameter) => parameter.name),
      ['analysis.mode'],
    );

    const parameter = analysisParameters[0];
    assert.ok(parameter !== undefined);
    assert.strictEqual(parameter.defaultValue, 'single');
    assert.strictEqual(parameter.required, false);
    assert.deepStrictEqual(parameter.aliases, ['am']);
    assert.strictEqual(parameter.validator?.('single'), true);
    assert.strictEqual(parameter.validator?.('range'), true);
    assert.match(String(parameter.validator?.('batch')), /Expected single or range/);
  });
});
