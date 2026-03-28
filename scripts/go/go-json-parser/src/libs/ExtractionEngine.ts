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
    if (obj === null || typeof obj !== 'object') return undefined;
    const record = obj as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];

    for (const value of Object.values(record)) {
      const found = this.recursiveSearch(value, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
}
