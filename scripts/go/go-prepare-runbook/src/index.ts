/**
 * GO Prepare Runbook - Entry Point
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
 */
script
  .run(async () => {
    await main(script);
  })
  .catch((error) => {
    // Il log dell'errore è gestito da GOScript se lanciato correttamente
    // ma assicuriamo l'uscita con errore in caso di fallimento della catch stessa
    console.error(error);
    process.exit(1);
  });
