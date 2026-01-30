/**
 * JSON Configuration Provider
 *
 * Reads configuration from JSON files or objects.
 * Supports nested objects with dot notation (e.g., "http.timeout" from {http: {timeout: 60}})
 */

import * as fs from 'fs';

import { GOConfigProviderBase } from '../GOConfigProvider.js';
import { GOSecretRedactor, GOSecretsSpecifierFactory } from '../GOSecretsSpecifier.js';
import type { GOSecretsSpecifier } from '../GOSecretsSpecifier.js';
import { valueToString } from '../../utils/GOValueToString.js';
import { getErrorMessage } from '../../errors/GOErrorUtils.js';

/**
 * Options for JSON config provider
 */
export interface GOJSONConfigProviderOptions {
  /** Path to JSON file */
  filePath?: string;

  /** JSON data object (alternative to filePath) */
  data?: Record<string, unknown>;

  /** Secret detection specification */
  secretsSpecifier?: GOSecretsSpecifier;

  /** File encoding (default: 'utf8') */
  encoding?: BufferEncoding;

  /** If true, doesn't throw error if file doesn't exist (default: false) */
  optional?: boolean;

  /** Custom display name for this provider (overrides default JSON(path) format) */
  displayName?: string;
}

/**
 * JSON configuration provider
 */
export class GOJSONConfigProvider extends GOConfigProviderBase {
  protected values: Map<string, string | string[]>;
  private readonly secretRedactor: GOSecretRedactor;
  private readonly filePath?: string | undefined;
  private readonly isOptional: boolean;
  private readonly displayName?: string | undefined;

  constructor(options: GOJSONConfigProviderOptions) {
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
      throw new Error('GOJSONConfigProvider requires either filePath or data option');
    }
  }

  getName(): string {
    if (this.displayName) {
      return this.displayName;
    }
    return this.filePath ? `JSON(${this.filePath})` : 'JSON(data)';
  }

  isSecret(key: string): boolean {
    const value = this.getValue(key);
    if (value === undefined) return false;
    return this.secretRedactor.isSecret(key, value);
  }

  /**
   * Load configuration from JSON file
   */
  private loadFromFile(filePath: string, encoding: BufferEncoding): void {
    // Check file existence for optional files
    if (!fs.existsSync(filePath)) {
      if (this.isOptional) {
        // TODO: EMIT EVENT??
        // console.debug(`[GOJSONConfigProvider] Optional file not found: ${filePath}`);
        return;
      }
      throw new Error(`Configuration file not found: ${filePath}`);
    }

    try {
      const content = fs.readFileSync(filePath, encoding);
      const data = JSON.parse(content) as Record<string, unknown>;
      this.loadFromData(data);
      // TODO: EMIT EVENT??
      // console.debug(`[GOJSONConfigProvider] Loaded ${this.values.size} keys from ${filePath}`);
    } catch (error: unknown) {
      if (this.isOptional) {
        // TODO: EMIT EVENT??
        // console.warn(`[GOJSONConfigProvider] Optional file could not be loaded: ${filePath} - ${getErrorMessage(error)}`);
        return;
      }
      throw new Error(`Failed to load JSON config from ${filePath}: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Load configuration from JSON object
   */
  private loadFromData(data: Record<string, unknown>): void {
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
  private flattenObject(obj: Record<string, unknown>, prefix = ''): Map<string, string | string[]> {
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
          value.map((v: unknown) => valueToString(v)),
        );
      } else if (typeof value === 'object' && !Buffer.isBuffer(value)) {
        // Recursively flatten nested objects
        const nested = this.flattenObject(value as Record<string, unknown>, fullKey);
        for (const [nestedKey, nestedValue] of nested) {
          result.set(nestedKey, nestedValue);
        }
      } else {
        // Primitive values
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
}
