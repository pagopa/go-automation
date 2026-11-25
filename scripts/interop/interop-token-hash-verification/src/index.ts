/**
 * Interop Verifica Hash Token - Entry Point
 *
 * Verifica hash dei token per l'allarme interop-be-audit-signer
 */

import { GOScript } from '@go-automation/go-script';

import { scriptMetadata, scriptParameters } from './config.js';
import { main } from './main.js';

/**
 * Create the GOScript instance with metadata and parameters from config
 */
const script = new GOScript({
  metadata: scriptMetadata,
  config: {
    parameters: scriptParameters,
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
