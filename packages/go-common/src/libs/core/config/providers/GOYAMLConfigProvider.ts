/**
 * YAML Configuration Provider
 *
 * Reads configuration from YAML files or objects.
 * Supports nested objects with dot notation (e.g., "http.timeout" from {http: {timeout: 60}})
 */

import * as fs from 'fs';
import { GOConfigProviderBase } from '../GOConfigProvider.js';
import { GOSecretRedactor, GOSecretsSpecifierFactory } from '../GOSecretsSpecifier.js';
import type { GOSecretsSpecifier } from '../GOSecretsSpecifier.js';
import { GOYAMLParser, isYAMLObject } from '../parsers/GOYAMLParser.js';
import type { YAMLValue } from '../parsers/GOYAMLParser.js';
import { getErrorMessage } from '../../errors/GOErrorUtils.js';
import { valueToString } from '../../utils/GOValueToString.js';

/**
 * Options for YAML config provider
 */
export interface GOYAMLConfigProviderOptions {
  /** Path to YAML file */
  filePath?: string;

  /** YAML data object (alternative to filePath) */
  data?: Record<string, unknown>;

  /** Secret detection specification */
  secretsSpecifier?: GOSecretsSpecifier;

  /** File encoding (default: 'utf8') */
  encoding?: BufferEncoding;

  /** If true, doesn't throw error if file doesn't exist (default: false) */
  optional?: boolean;

  /** Custom display name for this provider (overrides default YAML(path) format) */
  displayName?: string;
}

/**
 * YAML configuration provider
 */
export class GOYAMLConfigProvider extends GOConfigProviderBase {
  protected values: Map<string, string | string[]>;
  private readonly secretRedactor: GOSecretRedactor;
  private readonly filePath?: string | undefined;
  private readonly isOptional: boolean;
  private readonly displayName?: string | undefined;

  constructor(options: GOYAMLConfigProviderOptions) {
    super();

    this.values = new Map();
    this.secretRedactor = new GOSecretRedactor(options.secretsSpecifier ?? GOSecretsSpecifierFactory.none());
    this.filePath = options.filePath;
    this.isOptional = options.optional ?? false;
    this.displayName = options.displayName;

    // Load configuration
    if (options.filePath) {
      this.loadFromFile(options.filePath, options.encoding ?? 'utf8');
    } else if (options.data) {
      this.loadFromData(options.data);
    } else if (!this.isOptional) {
      throw new Error('GOYAMLConfigProvider requires either filePath or data option');
    }
  }

  getName(): string {
    if (this.displayName) {
      return this.displayName;
    }
    return this.filePath ? `YAML(${this.filePath})` : 'YAML(data)';
  }

  isSecret(key: string): boolean {
    const value = this.getValue(key);
    if (value === undefined) return false;
    return this.secretRedactor.isSecret(key, value);
  }

  /**
   * Load configuration from YAML file
   */
  private loadFromFile(filePath: string, encoding: BufferEncoding): void {
    // Check file existence for optional files
    if (!fs.existsSync(filePath)) {
      if (this.isOptional) {
        return;
      }
      throw new Error(`Configuration file not found: ${filePath}`);
    }

    try {
      const data = GOYAMLParser.parseFile(filePath, encoding);
      if (isYAMLObject(data)) {
        this.loadFromData(data);
      }
    } catch (error: unknown) {
      throw new Error(`Failed to load YAML config from ${filePath}: ${getErrorMessage(error)}`, { cause: error });
    }
  }

  /**
   * Load configuration from YAML object
   */
  private loadFromData(data: Record<string, YAMLValue> | Record<string, unknown>): void {
    const flattened = this.flattenObject(data);
    for (const [key, value] of flattened) {
      this.values.set(key, value);
    }
  }

  /**
   * Flatten nested object into dot-notation keys
   *
   * @example
   * { http: { client: { timeout: 60 } } } -> { "http.client.timeout": "60" }
   */
  private flattenObject(
    obj: Record<string, YAMLValue> | Record<string, unknown>,
    prefix = '',
  ): Map<string, string | string[]> {
    const result = new Map<string, string | string[]>();

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (value === null || value === undefined) {
        // Skip null/undefined values
        continue;
      }

      if (Array.isArray(value)) {
        // Handle arrays - convert all elements to strings
        result.set(
          fullKey,
          value.map((v) => valueToString(v)),
        );
      } else if (typeof value === 'object' && !Buffer.isBuffer(value) && !(value instanceof Date)) {
        // Recursively flatten nested objects (but not Dates)
        const nested = this.flattenObject(value as Record<string, unknown>, fullKey);
        for (const [nestedKey, nestedValue] of nested) {
          result.set(nestedKey, nestedValue);
        }
      } else {
        // Primitive values (including Date)
        result.set(fullKey, valueToString(value));
      }
    }

    return result;
  }

  /**
   * Reload configuration from file (only works if initialized with filePath)
   */
  reload(encoding: BufferEncoding = 'utf8'): void {
    if (!this.filePath) {
      throw new Error('Cannot reload: provider was not initialized with filePath');
    }

    this.values.clear();
    this.loadFromFile(this.filePath, encoding);
  }

  /**
   * Export current configuration as YAML string
   */
  toYAML(): string {
    const obj = this.unflattenObject();
    return GOYAMLParser.stringify(obj);
  }

  /**
   * Convert flat configuration back to nested object
   */
  private unflattenObject(): Record<string, YAMLValue> {
    const result: Record<string, YAMLValue> = {};

    for (const [key, value] of this.values) {
      const parts = key.split('.');
      let current: Record<string, YAMLValue> = result;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!part) {
          continue;
        }

        const existing = current[part];
        if (!isYAMLObject(existing)) {
          current[part] = {};
        }
        current = current[part] as Record<string, YAMLValue>;
      }

      const lastPart = parts[parts.length - 1];
      if (lastPart) {
        current[lastPart] = value;
      }
    }

    return result;
  }
}
