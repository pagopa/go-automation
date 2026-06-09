import type { Core } from '@go-automation/go-common';

import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';
import { WatchtowerClient } from '../watchtower/WatchtowerClient.js';
import { resolveInput } from './promptInputs.js';

/** Authenticated Watchtower connection. */
export interface Connection {
  readonly client: WatchtowerClient;
  readonly baseUrl: string;
}

/**
 * Resolves the base URL + credentials (config/env/prompt), logs in and returns
 * the authenticated client. Returns `undefined` (with a logged reason) on error.
 */
export async function resolveClient(script: Core.GOScript, config: GoRtaCheckConfig): Promise<Connection | undefined> {
  const logger = script.logger;
  const baseUrl = await resolveInput(config.watchtowerUrl, async () => script.prompt.text('Watchtower base URL'));
  if (baseUrl === '') {
    logger.error('Watchtower base URL mancante.');
    return undefined;
  }
  const email = await resolveInput(config.watchtowerEmail, async () => script.prompt.text('Watchtower email'));
  const password = config.watchtowerPassword ?? (await script.prompt.password('Watchtower password')) ?? '';
  if (email === '' || password === '') {
    logger.error('Credenziali Watchtower mancanti.');
    return undefined;
  }

  const client = new WatchtowerClient({ baseUrl, email, password });
  logger.info(`Login su ${baseUrl} …`);
  await client.login();
  return { client, baseUrl };
}
