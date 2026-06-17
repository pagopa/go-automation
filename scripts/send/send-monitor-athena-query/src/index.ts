/**
 * Send Monitor Athena Query - Entry Point
 *
 * Esegue una query Athena generica, esporta i risultati in CSV o JSON e pubblica un report su Slack con allegato e valutazione opzionale di soglie
 */

import { Core } from '@go-automation/go-common';

import { prepareConfig, scriptMetadata, scriptParameters } from './config.js';
import { main } from './main.js';

/**
 * Create the GOScript instance with metadata and parameters from config
 */
const script = new Core.GOScript({
  metadata: scriptMetadata,
  config: {
    parameters: scriptParameters,
  },
  hooks: {
    onAfterConfigLoad: prepareConfig,
  },
});

/**
 * Run the script with lifecycle management
 */
script
  .run(async () => {
    await main(script);
  })
  .catch(() => {
    process.exit(1);
  });
