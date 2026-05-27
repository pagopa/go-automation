import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GOSCRIPT_PRESET_FILE_PARAMETER,
  GOSCRIPT_PRESET_NAME_PARAMETER,
  getGOScriptSystemParameters,
} from '../GOScriptSystemParameters.js';

describe('GOScriptSystemParameters', () => {
  it('defines reserved preset parameters with stable names, CLI flags, aliases and env vars', () => {
    const parameters = getGOScriptSystemParameters();
    const presetName = parameters.find((parameter) => parameter.name === GOSCRIPT_PRESET_NAME_PARAMETER);
    const presetFile = parameters.find((parameter) => parameter.name === GOSCRIPT_PRESET_FILE_PARAMETER);

    assert.ok(presetName);
    assert.strictEqual(presetName.reserved, true);
    assert.strictEqual(presetName.cliFlag, '--script-preset-name');
    assert.deepStrictEqual(presetName.aliases, ['spn']);
    assert.strictEqual(presetName.envVar, 'SCRIPT_PRESET_NAME');

    assert.ok(presetFile);
    assert.strictEqual(presetFile.reserved, true);
    assert.strictEqual(presetFile.cliFlag, '--script-preset-file');
    assert.deepStrictEqual(presetFile.aliases, ['spf']);
    assert.strictEqual(presetFile.envVar, 'SCRIPT_PRESET_FILE');
  });
});
