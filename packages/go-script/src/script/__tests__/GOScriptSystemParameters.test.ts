import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOConfigParameter } from '../../config/GOConfigParameter.js';
import {
  GOSCRIPT_PRESET_FILE_PARAMETER,
  GOSCRIPT_PRESET_NAME_PARAMETER,
  GOSCRIPT_SYSTEM_PARAMETERS,
} from '../GOScriptSystemParameters.js';

describe('GOScriptSystemParameters', () => {
  it('defines reserved preset parameters with stable names, CLI flags, aliases and env vars', () => {
    const parameters = GOSCRIPT_SYSTEM_PARAMETERS;
    const presetName = parameters.find((parameter) => parameter.name === GOSCRIPT_PRESET_NAME_PARAMETER);
    const presetFile = parameters.find((parameter) => parameter.name === GOSCRIPT_PRESET_FILE_PARAMETER);

    assert.ok(presetName);
    assert.strictEqual(presetName.reserved, true);
    assert.deepStrictEqual(presetName.aliases, ['spn']);

    assert.ok(presetFile);
    assert.strictEqual(presetFile.reserved, true);
    assert.deepStrictEqual(presetFile.aliases, ['spf']);

    // Flags and env vars are left to GOConfigParameter, which derives them from the name.
    const resolvedName = new GOConfigParameter(presetName);
    assert.strictEqual(resolvedName.cliFlag, '--script-preset-name');
    assert.strictEqual(resolvedName.envVar, 'SCRIPT_PRESET_NAME');

    const resolvedFile = new GOConfigParameter(presetFile);
    assert.strictEqual(resolvedFile.cliFlag, '--script-preset-file');
    assert.strictEqual(resolvedFile.envVar, 'SCRIPT_PRESET_FILE');
  });
});
