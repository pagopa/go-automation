/**
 * Accesso sicuro alle proprietà di un oggetto record/dizionario.
 *
 * @param obj - L'oggetto da cui estrarre la proprietà
 * @param key - La chiave da cercare
 * @param defaultValue - Valore di fallback opzionale
 * @returns Il valore della proprietà o il valore di default
 */
export function get<T = unknown>(obj: unknown, key: string, defaultValue?: T): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return defaultValue as T;
  }
  const val = (obj as Record<string, unknown>)[key];
  return val !== undefined && val !== null ? (val as T) : (defaultValue as T);
}

/**
 * Estrae l'IUN da un requestId o da una stringa contenente uno IUN.
 * Gestisce i formati:
 * - Stringhe con prefisso errore: `SAFE_STORAGE_ERROR - PREPARE_ANALOG_DOMICILE.IUN_...`
 * - Request ID con prefisso .IUN_: `PREPARE_ANALOG_DOMICILE.IUN_ABCD-EFGH-1234.ATTEMPT_1`
 * - Request ID con prefisso IUN_: `IUN_ABCD-EFGH-1234.PCRETRY_0`
 * - IUN con prefisso IUN_: `IUN_ABCD-EFGH-1234`
 * - IUN puro: `ABCD-EFGH-1234`
 * - IUN con delimitatori aggiuntivi: `ABCD-EFGH-1234|extra` o `ABCD-EFGH-1234,fileKey`
 *
 * @param input - Il requestId o la riga da elaborare
 * @returns Lo IUN estratto o stringa vuota
 */
export function extractIun(input: string | undefined): string {
  if (!input) {
    return '';
  }
  const trimmed = input.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return '';
  }

  if (trimmed.includes('IUN_')) {
    const afterIun = trimmed.split('IUN_')[1] ?? '';
    const match = afterIun.match(/^[^.|,\s/]+/);
    return match ? match[0] : '';
  }

  const token = trimmed.split(/[,|\s/]+/)[0] ?? trimmed;
  return token.split('.')[0] ?? token;
}

export function iunFromRid(rid: string | undefined): string {
  return extractIun(rid);
}
