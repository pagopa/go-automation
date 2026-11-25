import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { scriptParameters } from '../config.js';

describe('go-analyze-alarm config', () => {
  it('declares analysis.mode as the only analysis parameter, single by default, validating the mode', () => {
    const analysisParameters = scriptParameters.filter((parameter) => parameter.name.startsWith('analysis.'));
    assert.deepStrictEqual(
      analysisParameters.map((parameter) => parameter.name),
      ['analysis.mode'],
    );

    const parameter = analysisParameters[0];
    assert.ok(parameter !== undefined);
    assert.strictEqual(parameter.defaultValue, 'single');
    for (const mode of ['single', 'range', 'stats']) assert.strictEqual(parameter.validator?.(mode), true);
    assert.match(String(parameter.validator?.('batch')), /Expected single, range or stats/);
  });
});
