export class ExtractionEngine {
  /**
   * Tenta di estrarre un valore usando un path (es. user.id).
   * Se fallisce, esegue una ricerca ricorsiva della chiave.
   */
  static extract(obj: unknown, path: string): unknown {
    // 1. Path-based resolution
    const pathValue = this.resolvePath(obj, path);
    if (pathValue !== undefined) return pathValue;

    // 2. Recursive fallback
    const lastPart = path.split('.').pop() ?? path;
    return this.recursiveSearch(obj, lastPart);
  }

  private static resolvePath(obj: unknown, path: string): unknown {
    return path.split('.').reduce((acc: unknown, part: string) => (acc as Record<string, unknown>)?.[part], obj);
  }

  private static recursiveSearch(obj: unknown, key: string): unknown {
    if (obj === null) return undefined;

    // Se è un oggetto, cerchiamo nelle sue chiavi
    if (typeof obj === 'object') {
      const record = obj as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];

      for (const value of Object.values(record)) {
        const found = this.recursiveSearch(value, key);
        if (found !== undefined) return found;
      }
    }

    // Se è una stringa, proviamo a vedere se è un JSON validabile (es. SQS Body)
    if (typeof obj === 'string' && (obj.startsWith('{') || obj.startsWith('['))) {
      try {
        const parsed = JSON.parse(obj) as unknown;
        return this.recursiveSearch(parsed, key);
      } catch (_err) {
        // Non è un JSON valido, ignoriamo
      }
    }

    return undefined;
  }
}
