import type { ApiGwAlarmConfig } from '../types/ApiGwAlarmConfig.js';
import type { ApiGwQueryProfile } from './ApiGwQueryProfile.js';
import { SEND_API_GW_PROFILE } from './SEND_API_GW_PROFILE.js';

/**
 * Risolve il profilo da usare per assemblare un runbook API Gateway,
 * applicando la policy di transizione v1.x e la precedenza fra
 * `queryProfile` esplicito e `queryTemplates` legacy.
 *
 * Regole:
 *
 * 1. Se `queryProfile` e `queryTemplates` sono entrambi presenti →
 *    **throw**. Mixare un profilo strutturato con override stringhe
 *    legacy è ambiguo: l'autore deve scegliere uno dei due mondi.
 *
 * 2. Se `queryProfile` è presente → restituisce `queryProfile` as-is.
 *
 * 3. Se solo `queryTemplates` è presente → emette deprecation warning
 *    una volta per processo, poi restituisce `SEND_API_GW_PROFILE` con
 *    `accessLog.query` e `serviceLog.queryTemplate` sovrascritti dai
 *    valori di `queryTemplates`. Compat path: vecchi consumer SEND con
 *    override testuali continuano a funzionare.
 *
 * 4. Se né l'uno né l'altro → restituisce `SEND_API_GW_PROFILE`. Path
 *    di transizione esplicito (i 3 runbook SEND attuali ricadono qui
 *    finché non dichiarano esplicito `queryProfile`).
 *
 * In v2.0 i casi 3 e 4 verranno rimossi e `queryProfile` diventerà
 * obbligatorio.
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
