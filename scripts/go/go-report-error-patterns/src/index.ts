/**
 * Go Report Error Patterns - Entry Point
 *
 * Genera un report sui pattern di errore nei log di AWS CloudWatch correlati all'attivazione degli allarmi.
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
