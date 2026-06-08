/**
 * Go RTA Check - Entry Point.
 *
 * Compares go-analyze-alarm runbook executions with Watchtower analyses over
 * all occurrences of an alarm in a period.
 */
import { Core } from '@go-automation/go-common';

import { scriptMetadata, scriptParameters } from './config.js';
import { main } from './main.js';

const script = new Core.GOScript({
  metadata: scriptMetadata,
  config: {
    parameters: scriptParameters,
  },
});

script
  .run(async () => {
    await main(script);
  })
  .catch(() => {
    process.exit(1);
  });
