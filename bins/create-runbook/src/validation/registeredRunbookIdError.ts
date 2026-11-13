import type { RegisteredRunbookIds } from './RegisteredRunbookIds.js';

/**
 * Rejects a new runbook id already taken in the inventory: as the key of
 * another runbook, or as one of its alarm names (aliases included). The new
 * runbook registers the id as both key and alarm name, and the registry
 * rejects a duplicate key or an ambiguous alarm name across all products.
 *
 * @param id - Candidate runbook id
 * @param registrations - Registrations of every product manifest
 * @returns An error message when taken, or `undefined` when free
 */
export function registeredRunbookIdError(
  id: string,
  registrations: ReadonlyArray<RegisteredRunbookIds>,
): string | undefined {
  for (const registration of registrations) {
    if (registration.key === id) {
      return `Il runbook id "${id}" è già la chiave di un runbook registrato.`;
    }
    if (registration.alarmNames.includes(id)) {
      return `Il runbook id "${id}" è già un nome d'allarme del runbook "${registration.key}".`;
    }
  }
  return undefined;
}
