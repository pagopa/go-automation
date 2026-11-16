import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOCommandLineConfigProvider, GOScript } from '@go-automation/go-script';

import { scriptMetadata, scriptParameters } from '../../config.js';
import type { GoRtaCheckConfig } from '../../types/GoRtaCheckConfig.js';

describe('go-rta-check config', () => {
  it('does not preload the analyses-only AWS profile', async () => {
    const script = new GOScript({
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
        configProviders: [new GOCommandLineConfigProvider({ arguments: [] })],
      },
    });

    const config = await script.getConfiguration<GoRtaCheckConfig>();

    assert.strictEqual(config.awsProfile, undefined);
  });

  it('loads --aws-profile into awsProfile', async () => {
    const script = new GOScript({
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
          new GOCommandLineConfigProvider({
            arguments: ['--aws-profile', 'standard-profile'],
          }),
        ],
      },
    });

    const config = await script.getConfiguration<GoRtaCheckConfig>();

    assert.strictEqual(config.awsProfile, 'standard-profile');
  });
});
