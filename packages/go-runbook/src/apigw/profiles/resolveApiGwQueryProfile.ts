import type { ApiGwAlarmConfig } from '../types/ApiGwAlarmConfig.js';
import type { ApiGwQueryProfile } from './ApiGwQueryProfile.js';
import { SEND_API_GW_PROFILE } from './SEND_API_GW_PROFILE.js';

/**
 * Risolve il profilo da usare per assemblare un runbook API Gateway.
 *
 * @param config - configurazione di build del runbook
 * @returns il profilo risolto, pronto per essere consumato dagli step
 */
export function resolveApiGwQueryProfile(config: ApiGwAlarmConfig): ApiGwQueryProfile {
  if (config.queryProfile !== undefined) {
    return config.queryProfile;
  }

  return SEND_API_GW_PROFILE;
}
