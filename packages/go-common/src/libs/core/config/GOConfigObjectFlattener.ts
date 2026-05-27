import { valueToString } from '../utils/GOValueToString.js';

export type GOFlattenedConfigValue = string | string[];

export interface GOConfigObjectFlattenerOptions {
  readonly rejectDangerousKeys?: boolean;
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export class GOConfigObjectFlattener {
  static flatten(
    data: Record<string, unknown>,
    options: GOConfigObjectFlattenerOptions = {},
  ): Map<string, GOFlattenedConfigValue> {
    const flattener = new GOConfigObjectFlattener(options);
    return flattener.flattenObject(data);
  }

  private readonly rejectDangerousKeys: boolean;

  private constructor(options: GOConfigObjectFlattenerOptions) {
    this.rejectDangerousKeys = options.rejectDangerousKeys ?? true;
  }

  private flattenObject(data: Record<string, unknown>, prefix = ''): Map<string, GOFlattenedConfigValue> {
    const result = new Map<string, GOFlattenedConfigValue>();

    for (const [key, value] of Object.entries(data)) {
      this.assertSafeKey(key, prefix);

      const fullKey = prefix.length > 0 ? `${prefix}.${key}` : key;

      if (value === null || value === undefined) {
        continue;
      }

      this.assertSafeValue(value, fullKey);

      if (Array.isArray(value)) {
        result.set(
          fullKey,
          value.map((item) => valueToString(item)),
        );
        continue;
      }

      if (this.isFlattenableObject(value)) {
        const nested = this.flattenObject(value, fullKey);
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
    if (!this.rejectDangerousKeys || !DANGEROUS_KEYS.has(key)) {
      return;
    }

    const location = prefix.length > 0 ? `${prefix}.${key}` : key;
    throw new Error(`Unsafe configuration key "${location}" is not allowed`);
  }

  private assertSafeValue(value: unknown, location: string): void {
    if (!this.rejectDangerousKeys) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        this.assertSafeValue(item, `${location}[${String(index)}]`);
      });
      return;
    }

    if (!this.isObjectLike(value) || Buffer.isBuffer(value) || value instanceof Date) {
      return;
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      if (DANGEROUS_KEYS.has(key)) {
        throw new Error(`Unsafe configuration key "${location}.${key}" is not allowed`);
      }
      this.assertSafeValue(nestedValue, `${location}.${key}`);
    }
  }

  private isFlattenableObject(value: unknown): value is Record<string, unknown> {
    return this.isObjectLike(value) && !Buffer.isBuffer(value) && !(value instanceof Date);
  }

  private isObjectLike(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
