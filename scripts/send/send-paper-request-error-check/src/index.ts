/**
 * Send Paper Request Error Check - Entry Point
 *
 * Entrypoint principale per l'esecuzione dello script di diagnosi ed elaborazione Paper Request
 */

import { Core } from '@go-automation/go-common';

import { prepareConfig, scriptMetadata, scriptParameters } from './config.js';
import { main } from './main.js';

/**
 * Instanzia GOScript con metadati e parametri di configurazione
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
 * Esegue lo script gestendo il ciclo di vita
 */
script
  .run(async () => {
    await main(script);
  })
  .catch(() => {
    process.exit(1);
  });
