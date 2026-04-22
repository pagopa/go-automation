/**
 * Send Delete SQS - Entry Point
 */

import { Core } from '@go-automation/go-common';

import { scriptMetadata, scriptParameters } from './config.js';
import { main } from './main.js';

// Wiring GOScript with options
const script = new Core.GOScript({
  metadata: scriptMetadata,
  config: {
    parameters: scriptParameters,
  },
});

// Initializing the script
script
  .run(async () => {
    await main(script);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
