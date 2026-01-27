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
import { GOYAMLParser } from '../parsers/GOYAMLParser.js';

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
    this.secretRedactor = new GOSecretRedactor(
      options.secretsSpecifier ?? GOSecretsSpecifierFactory.none(),
    );
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
        // TODO: EMIT EVENT??
        // console.debug(`[GOYAMLConfigProvider] Optional file not found: ${filePath}`);
        return;
      }
      throw new Error(`Configuration file not found: ${filePath}`);
    }

    try {
      const data = GOYAMLParser.parseFile(filePath, encoding);
      this.loadFromData(data);
      // TODO: EMIT EVENT??
      // console.debug(`[GOYAMLConfigProvider] Loaded ${this.values.size} keys from ${filePath}`);
    } catch (error: any) {
      if (this.isOptional) {
        // TODO: EMIT EVENT??
        // console.warn(`[GOYAMLConfigProvider] Optional file could not be loaded: ${filePath} - ${error.message}`);
        return;
      }
      throw new Error(`Failed to load YAML config from ${filePath}: ${error.message}`);
    }
  }

  /**
   * Load configuration from YAML object
   */
  private loadFromData(data: Record<string, any>): void {
    const flattened = this.flattenObject(data);
    flattened.forEach((value, key) => {
      this.values.set(key, value);
    });
  }

  /**
   * Flatten nested object into dot-notation keys
   *
   * @example
   * { http: { client: { timeout: 60 } } } -> { "http.client.timeout": "60" }
   */
  private flattenObject(obj: any, prefix = ''): Map<string, string | string[]> {
    const result = new Map<string, string | string[]>();

    Object.entries(obj).forEach(([key, value]) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (value === null || value === undefined) {
        // Skip null/undefined values
        return;
      }

      if (Array.isArray(value)) {
        // Handle arrays - convert all elements to strings
        result.set(
          fullKey,
          value.map((v) => this.valueToString(v)),
        );
      } else if (typeof value === 'object' && !Buffer.isBuffer(value) && !(value instanceof Date)) {
        // Recursively flatten nested objects (but not Dates)
        const nested = this.flattenObject(value, fullKey);
        nested.forEach((nestedValue, nestedKey) => {
          result.set(nestedKey, nestedValue);
        });
      } else {
        // Primitive values (including Date)
        result.set(fullKey, this.valueToString(value));
      }
    });

    return result;
  }

  /**
   * Convert any value to string for storage
   */
  private valueToString(value: any): string {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (Buffer.isBuffer(value)) {
      return value.toString('base64');
    }
    // For other types, use JSON
    return JSON.stringify(value);
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
  private unflattenObject(): Record<string, any> {
    const result: Record<string, any> = {};

    this.values.forEach((value, key) => {
      const parts = key.split('.');
      let current = result;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!part) continue;
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }

      const lastPart = parts[parts.length - 1];
      if (lastPart) {
        current[lastPart] = value;
      }
    });

    return result;
  }
}
