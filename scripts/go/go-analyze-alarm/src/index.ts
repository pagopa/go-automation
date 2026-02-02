/**
 * Go Analyze Alarm - Entry Point
 *
 * Analyzes an alarm, executes its associated runbook, and determines the correct operational outcome and next action based on collected evidence and known cases.
 */

import { Core } from '@go-automation/go-common';

import { scriptMetadata, scriptParameters } from './config.js';
import { main } from './main.js';

/**
 * Create the GOScript instance with metadata and parameters from config
 */
const script = new Core.GOScript({
  metadata: scriptMetadata,
  config: {
    parameters: [...scriptParameters],
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
