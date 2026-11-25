import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOCommandLineConfigProvider, GOScript } from '@go-automation/go-script';

import { scriptMetadata, scriptParameters } from '../../config.js';
import type { GoRtaCheckConfig } from '../../types/GoRtaCheckConfig.js';

/** Loads the script configuration from the given command line only. */
async function loadConfig(args: ReadonlyArray<string>): Promise<GoRtaCheckConfig> {
  const script = new GOScript({
    metadata: scriptMetadata,
    logging: { console: false, file: false, logConfigOnStart: false },
    config: {
      autoHelp: false,
      rejectUnknownParameters: false,
      parameters: scriptParameters,
      configProviders: [new GOCommandLineConfigProvider({ arguments: [...args] })],
    },
  });
  return await script.getConfiguration<GoRtaCheckConfig>();
}

describe('go-rta-check config', () => {
  it('loads --aws-profile into awsProfile, without preloading the analyses-only profile', async () => {
    assert.strictEqual((await loadConfig([])).awsProfile, undefined);
    assert.strictEqual((await loadConfig(['--aws-profile', 'standard-profile'])).awsProfile, 'standard-profile');
  });
});
