#!/usr/bin/env node
/**
 * SEND Dispatch Notifications - Entry Point
 *
 * Minimal entry point that wires together:
 * - GOScript instantiation with metadata, parameters and the cleanup hook
 * - Main business logic execution
 */

import { Core } from '@go-automation/go-common';

import { scriptMetadata, scriptParameters } from './config.js';
import { DispatchShutdown } from './libs/DispatchShutdown.js';
import { main } from './main.js';

/** Per-run graceful-stop coordinator: on SIGINT the run drains and materializes. */
const shutdown = new DispatchShutdown();

/**
 * Create the GOScript instance with metadata and parameters from config
 */
const script = new Core.GOScript({
  metadata: scriptMetadata,
  config: {
    parameters: scriptParameters,
  },
  hooks: {
    onCleanup: async () => shutdown.stopAndWait(),
  },
});

/**
 * Run the script with lifecycle management
 */
script
  .run(async () => {
    await main(script, shutdown);
  })
  .catch(() => {
    process.exit(1);
  });
