/**
 * JSON Field Extractor
 *
 * Extracts values from JSON objects using two strategies:
 * 1. Path-based navigation (dot-notation + bracket indices)
 * 2. Recursive key search (depth-limited, with optional embedded JSON parsing)
 *
 * The `extract()` method combines both: path-first, then recursive fallback.
 */

import { navigateFieldPath } from './fieldPath.js';
import type { GOJSONFieldExtractorOptions } from './GOJSONFieldExtractorOptions.js';

const DEFAULT_MAX_DEPTH = 50;
const DEFAULT_MIN_EMBEDDED_JSON_LENGTH = 2;

/**
 * Configurable JSON field extractor.
 * Instantiate with options, then call extract/extractByPath/extractByKey on any number of objects.
 *
 * @example
 * ```typescript
 * const extractor = new GOJSONFieldExtractor({ parseEmbeddedJson: true, maxDepth: 30 });
 * const value = extractor.extract(obj, 'user.address.city');
 * ```
 */
export class GOJSONFieldExtractor {
  private readonly maxDepth: number;
  private readonly parseEmbeddedJson: boolean;
  private readonly minEmbeddedJsonLength: number;

  constructor(options?: GOJSONFieldExtractorOptions) {
    this.maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
    this.parseEmbeddedJson = options?.parseEmbeddedJson ?? false;
    this.minEmbeddedJsonLength = options?.minEmbeddedJsonLength ?? DEFAULT_MIN_EMBEDDED_JSON_LENGTH;
  }

  /**
   * Extracts a value using path-based navigation first, then falls back to recursive key search.
   *
   * @param obj - The source object
   * @param fieldPath - Dot-notation path (e.g. 'user.address.city') or simple key name
   * @returns The extracted value, or undefined if not found
   *
   * @example
   * ```typescript
   * extractor.extract({ user: { name: 'Ada' } }, 'user.name');  // 'Ada'
   * extractor.extract({ deep: { user: { name: 'Ada' } } }, 'name');  // 'Ada' (recursive)
   * ```
   */
  extract(obj: unknown, fieldPath: string): unknown {
    // 1. Path-based resolution (fast path)
    const pathValue = this.extractByPath(obj, fieldPath);
    if (pathValue !== undefined) {
      return pathValue;
    }

    // 2. Recursive fallback using the last segment as key
    const lastSegment = fieldPath.split('.').pop() ?? fieldPath;
    return this.extractByKey(obj, lastSegment);
  }

  /**
   * Navigates an object using dot-notation and bracket indices.
   * Does NOT perform recursive search.
   *
   * @param obj - The source object
   * @param fieldPath - Path string (e.g. 'items[2].name', 'data.results[0].status')
   * @returns The value at the path, or undefined if not reachable
   */
  extractByPath(obj: unknown, fieldPath: string): unknown {
    return navigateFieldPath(obj, fieldPath);
  }

  /**
   * Searches recursively through the object tree for a key by name.
   * Returns the first match found (depth-first).
   *
   * @param obj - The source object
   * @param key - The key name to search for
   * @returns The value associated with the first matching key, or undefined
   */
  extractByKey(obj: unknown, key: string): unknown {
    return this.recursiveSearch(obj, key, 0);
  }

  /**
   * Depth-limited recursive search for a key in an object graph.
   * Optionally parses embedded JSON strings (e.g. SQS Body, SNS Message).
   */
  private recursiveSearch(obj: unknown, key: string, depth: number): unknown {
    if (depth > this.maxDepth || obj == null) {
      return undefined;
    }

    if (typeof obj === 'object') {
      const record = obj as Record<string, unknown>;

      // Direct key match at current level
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        return record[key];
      }

      // Recurse into child values
      for (const value of Object.values(record)) {
        const found = this.recursiveSearch(value, key, depth + 1);
        if (found !== undefined) {
          return found;
        }
      }
    }

    // Optionally parse embedded JSON strings
    if (this.parseEmbeddedJson && typeof obj === 'string' && obj.length >= this.minEmbeddedJsonLength) {
      const firstChar = obj.charAt(0);
      if (firstChar === '{' || firstChar === '[') {
        try {
          const parsed: unknown = JSON.parse(obj);
          return this.recursiveSearch(parsed, key, depth + 1);
        } catch {
          // Not valid JSON — skip
        }
      }
    }

    return undefined;
  }
}
