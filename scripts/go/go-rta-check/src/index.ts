/**
 * Go RTA Check - Entry Point.
 *
 * Compares go-analyze-alarm runbook executions with Watchtower analyses over
 * all occurrences of an alarm in a period.
 */
import { GOScript } from '@go-automation/go-script';

import { scriptMetadata, scriptParameters } from './config.js';
import { main } from './main.js';

const script = new GOScript({
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
