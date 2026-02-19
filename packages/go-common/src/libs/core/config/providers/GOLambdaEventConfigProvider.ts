/**
 * Lambda Event Configuration Provider
 *
 * Maps a Lambda event payload to configuration parameters.
 * Designed as the highest-priority config provider in Lambda environments,
 * so per-invocation event data overrides file and environment variable defaults.
 *
 * Key normalization (applied in priority order):
 * 1. dot.notation keys  → used as-is:      "start.date"  → "start.date"
 * 2. snake_case keys    → replace _ with .: "start_date"  → "start.date"
 * 3. camelCase keys     → insert dots:      "startDate"   → "start.date"
 *
 * Value normalization:
 * - string             → kept as string
 * - number / boolean   → converted with String()
 * - string[]           → kept as string[]
 * - primitive[]        → each element converted with String()
 * - null / undefined   → omitted
 * - object             → omitted (not mappable to flat config)
 *
 * @example
 * ```typescript
 * // Event payload: { "startDate": "2024-01", "awsProfile": "prod", "limit": 100 }
 * // Mapped as:     { "start.date": "2024-01", "aws.profile": "prod", "limit": "100" }
 * ```
 */

import { GOConfigProviderBase } from '../GOConfigProvider.js';
import { GOSecretRedactor, GOSecretsSpecifierFactory } from '../GOSecretsSpecifier.js';

/**
 * Keys that must never be mapped to configuration parameters.
 * Prevents prototype pollution when processing event payloads from untrusted sources.
 */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Lambda event configuration provider.
 *
 * Translates a Lambda event payload into the dot-notation key format
 * expected by the GOScript configuration system.
 */
export class GOLambdaEventConfigProvider extends GOConfigProviderBase {
  protected values: Map<string, string | string[]>;
  private readonly secretRedactor: GOSecretRedactor;

  constructor(event: Record<string, unknown>) {
    super();
    this.values = new Map();
    this.secretRedactor = new GOSecretRedactor(GOSecretsSpecifierFactory.none());
    this.loadEvent(event);
  }

  getName(): string {
    return 'LambdaEvent';
  }

  isSecret(key: string): boolean {
    const value = this.getValue(key);
    if (value === undefined) return false;
    return this.secretRedactor.isSecret(key, Array.isArray(value) ? value.join(',') : value);
  }

  /**
   * Replace all values with those from a new event payload.
   *
   * Called at the start of each Lambda invocation to support container reuse:
   * the same provider instance is updated rather than recreated, avoiding
   * the overhead of rebuilding the full config reader chain.
   *
   * @param event - New Lambda event payload for this invocation
   */
  updateValues(event: Record<string, unknown>): void {
    this.values.clear();
    this.loadEvent(event);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private loadEvent(event: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(event)) {
      // Skip dangerous keys to prevent prototype pollution
      if (DANGEROUS_KEYS.has(key)) {
        continue;
      }
      const normalizedKey = GOLambdaEventConfigProvider.normalizeKey(key);
      const normalizedValue = GOLambdaEventConfigProvider.normalizeValue(value);
      if (normalizedValue !== undefined) {
        this.values.set(normalizedKey, normalizedValue);
      }
    }
  }

  /**
   * Normalize an event key to dot.notation format.
   *
   * @param key - Raw event key (camelCase, snake_case, or dot.notation)
   * @returns Normalized key in dot.notation
   *
   * @example
   * normalizeKey('startDate')   // → 'start.date'
   * normalizeKey('aws_profile') // → 'aws.profile'
   * normalizeKey('start.date')  // → 'start.date'
   * normalizeKey('limit')       // → 'limit'
   */
  private static normalizeKey(key: string): string {
    // Already dot.notation → keep as-is
    if (key.includes('.')) {
      return key;
    }

    // snake_case → dot.notation
    if (key.includes('_')) {
      return key.replace(/_/g, '.');
    }

    // camelCase → dot.notation: insert '.' before each uppercase letter, then lowercase
    return key
      .replace(/([A-Z])/g, '.$1')
      .toLowerCase()
      .replace(/^\./, '');
  }

  /**
   * Normalize an event value to string | string[] | undefined.
   *
   * Objects and other non-primitive types are omitted because they cannot
   * be represented as flat config values.
   *
   * @param value - Raw event value
   * @returns Normalized value, or undefined if not representable
   */
  private static normalizeValue(value: unknown): string | string[] | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      const strings: string[] = [];
      for (const item of value) {
        if (typeof item === 'string') {
          strings.push(item);
        } else if (typeof item === 'number' || typeof item === 'boolean') {
          strings.push(String(item));
        }
        // null / undefined / object items are skipped
      }
      return strings.length > 0 ? strings : undefined;
    }

    // Objects and other complex types cannot be mapped to flat config values
    return undefined;
  }
}
