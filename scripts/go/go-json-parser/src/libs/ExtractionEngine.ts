export class ExtractionEngine {
  /**
   * Tenta di estrarre un valore usando un path (es. user.id).
   * Se fallisce, esegue una ricerca ricorsiva della chiave.
   */
  static extract(obj: any, path: string): any {
    // 1. Path-based resolution
    const pathValue = this.resolvePath(obj, path);
    if (pathValue !== undefined) return pathValue;

    // 2. Recursive fallback
    const lastPart = path.split('.').pop() || path;
    return this.recursiveSearch(obj, lastPart);
  }

  private static resolvePath(obj: any, path: string): any {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  }

  private static recursiveSearch(obj: any, key: string): any {
    if (obj === null || typeof obj !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];

    for (const k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) {
        const found = this.recursiveSearch(obj[k], key);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  }
}
