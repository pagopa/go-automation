import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Core } from '@go-automation/go-common';

import { scriptMetadata, scriptParameters } from '../../config.js';
import type { GoRtaCheckConfig } from '../../types/GoRtaCheckConfig.js';

describe('go-rta-check config', () => {
  it('loads --aws-profile into awsProfile', async () => {
    const script = new Core.GOScript({
      metadata: scriptMetadata,
      logging: {
        console: false,
        file: false,
        logConfigOnStart: false,
      },
      config: {
        autoHelp: false,
        rejectUnknownParameters: false,
        parameters: scriptParameters,
        configProviders: [
          new Core.GOCommandLineConfigProvider({
            arguments: ['--aws-profile', 'standard-profile'],
          }),
        ],
      },
    });

    const config = await script.getConfiguration<GoRtaCheckConfig>();

    assert.strictEqual(config.awsProfile, 'standard-profile');
  });
});
