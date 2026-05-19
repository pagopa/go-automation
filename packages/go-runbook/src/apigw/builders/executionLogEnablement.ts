import type { ApiGwAlarmConfig } from '../types/ApiGwAlarmConfig.js';
import type { ApiGwQueryProfile } from '../profiles/ApiGwQueryProfile.js';

/**
 * Restituisce il log group degli execution log "effettivo": trimmato e
 * vuoto-è-assente.
 *
 * V04 (E2/D19): allinea la semantica di "executionLogGroup assente"
 * fra validation e branching della pipeline. Senza questo helper, V02
 * usava `!== undefined` in validation e `trim() !== ''` in
 * `isExecutionLogEnabled` → casi limite incoerenti per stringa vuota o
 * whitespace.
 *
 * @param config - configurazione del runbook
 * @returns il log group trimmato, oppure `undefined` se assente/vuoto
 */
export function getEffectiveExecutionLogGroup(config: ApiGwAlarmConfig): string | undefined {
  const raw = config.entryService.executionLogGroup;
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Indica se la capability ExecutionLog è abilitata per questo runbook.
 * `true` solo quando _entrambi_ sono presenti:
 *
 * - il profilo dichiara `executionLog`
 * - `entryService.executionLogGroup` è valorizzato e non vuoto
 *
 * Usato sia dal branching della pipeline in `createApiGwAlarmRunbook` sia
 * dalla validazione `validateKnownCaseStepRefs` per calcolare il set di
 * step ID effettivamente cablati.
 *
 * @param config - configurazione del runbook
 * @param profile - profilo risolto via `resolveApiGwQueryProfile`
 */
export function isExecutionLogEnabled(config: ApiGwAlarmConfig, profile: ApiGwQueryProfile): boolean {
  return profile.executionLog !== undefined && getEffectiveExecutionLogGroup(config) !== undefined;
}
