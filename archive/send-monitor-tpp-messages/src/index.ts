/**
 * SEND Monitor TPP Messages - Entry Point
 *
 * Minimal entry point that wires together:
 * - GOScript instantiation with metadata and parameters
 * - Main business logic execution
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
    parameters: scriptParameters,
  },
});

/**
 * Run the script with lifecycle management
 *
 * Flow:
 * 1. GOScript handles initialization and config loading
 * 2. main() receives script for business logic execution
 */
script
  .run(async () => {
    await main(script);
  })
  .catch(() => {
    process.exit(1);
  });
