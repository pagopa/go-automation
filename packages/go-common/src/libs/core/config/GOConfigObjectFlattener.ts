import { formatUnsafeKeyLocation, isDangerousKey } from '../security/DangerousKeys.js';
import { valueToString } from '../utils/GOValueToString.js';

export type GOFlattenedConfigValue = string | string[];

export interface GOConfigObjectFlattenerOptions {
  readonly rejectDangerousKeys?: boolean;
  readonly maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 64;

export class GOConfigObjectFlattener {
  static flatten(
    data: Record<string, unknown>,
    options: GOConfigObjectFlattenerOptions = {},
  ): Map<string, GOFlattenedConfigValue> {
    const flattener = new GOConfigObjectFlattener(options);
    return flattener.flattenObject(data);
  }

  private readonly rejectDangerousKeys: boolean;
  private readonly maxDepth: number;

  private constructor(options: GOConfigObjectFlattenerOptions) {
    this.rejectDangerousKeys = options.rejectDangerousKeys ?? true;
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;

    if (!Number.isInteger(this.maxDepth) || this.maxDepth < 0) {
      throw new Error('GOConfigObjectFlattener maxDepth must be a non-negative integer');
    }
  }

  private flattenObject(data: Record<string, unknown>, prefix = '', depth = 0): Map<string, GOFlattenedConfigValue> {
    this.assertWithinDepth(prefix.length > 0 ? prefix : '(root)', depth);
    const result = new Map<string, GOFlattenedConfigValue>();

    for (const [key, value] of Object.entries(data)) {
      this.assertSafeKey(key, prefix);

      const fullKey = prefix.length > 0 ? `${prefix}.${key}` : key;

      if (value === null || value === undefined) {
        continue;
      }

      if (Array.isArray(value)) {
        this.assertSafeValue(value, fullKey, depth + 1);
        result.set(
          fullKey,
          value.map((item) => valueToString(item)),
        );
        continue;
      }

      if (this.isFlattenableObject(value)) {
        const nested = this.flattenObject(value, fullKey, depth + 1);
        for (const [nestedKey, nestedValue] of nested) {
          result.set(nestedKey, nestedValue);
        }
        continue;
      }

      result.set(fullKey, valueToString(value));
    }

    return result;
  }

  private assertSafeKey(key: string, prefix: string): void {
    if (!this.rejectDangerousKeys || !isDangerousKey(key)) {
      return;
    }

    const location = formatUnsafeKeyLocation(prefix, key);
    throw new Error(`Unsafe configuration key "${location}" is not allowed`);
  }

  private assertSafeValue(value: unknown, location: string, depth: number): void {
    this.assertWithinDepth(location, depth);

    if (!this.rejectDangerousKeys) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        this.assertSafeValue(item, `${location}[${String(index)}]`, depth + 1);
      });
      return;
    }

    if (!this.isObjectLike(value) || Buffer.isBuffer(value) || value instanceof Date) {
      return;
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      if (isDangerousKey(key)) {
        throw new Error(`Unsafe configuration key "${location}.${key}" is not allowed`);
      }
      this.assertSafeValue(nestedValue, `${location}.${key}`, depth + 1);
    }
  }

  private assertWithinDepth(location: string, depth: number): void {
    if (depth > this.maxDepth) {
      throw new Error(`Configuration object exceeds maximum depth of ${String(this.maxDepth)} at "${location}"`);
    }
  }

  private isFlattenableObject(value: unknown): value is Record<string, unknown> {
    return this.isObjectLike(value) && !Buffer.isBuffer(value) && !(value instanceof Date);
  }

  private isObjectLike(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
