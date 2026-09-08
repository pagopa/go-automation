/**
 * Accesso sicuro alle proprietà di un oggetto record/dizionario
 * simile alla sintassi `.get(key, default)` di Python.
 *
 * @param obj - L'oggetto da cui estrarre la proprietà
 * @param key - La chiave da cercare
 * @param defaultValue - Valore di fallback opzionale
 * @returns Il valore della proprietà o il valore di default
 */
export function get<T = unknown>(
  obj: unknown,
  key: string,
  defaultValue?: T,
): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return defaultValue as T;
  }
  const val = (obj as Record<string, unknown>)[key];
  return val !== undefined && val !== null ? (val as T) : (defaultValue as T);
}
