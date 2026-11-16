/**
 * Send Paper Request Error Check - Entry Point
 *
 * Entrypoint principale per l'esecuzione dello script di diagnosi ed elaborazione Paper Request
 */

import { GOScript } from '@go-automation/go-script';

import { scriptMetadata, scriptParameters } from './config.js';
import { main } from './main.js';

/**
 * Instanzia GOScript con metadati e parametri di configurazione
 */
const script = new GOScript({
  metadata: scriptMetadata,
  config: {
    parameters: scriptParameters,
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
