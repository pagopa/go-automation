/**
 * JSON Configuration Provider
 *
 * Reads configuration from JSON files or objects.
 * Supports nested objects with dot notation (e.g., "http.timeout" from {http: {timeout: 60}})
 */

import * as fs from 'fs';

import { GOConfigProviderBase } from '../GOConfigProvider.js';
import { GOConfigObjectFlattener } from '../GOConfigObjectFlattener.js';
import { GOSecretRedactor, GOSecretsSpecifierFactory } from '../GOSecretsSpecifier.js';
import type { GOSecretsSpecifier } from '../GOSecretsSpecifier.js';
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
        return;
      }
      throw new Error(`Configuration file not found: ${filePath}`);
    }

    try {
      const content = fs.readFileSync(filePath, encoding);
      const data = JSON.parse(content) as Record<string, unknown>;
      this.loadFromData(data);
    } catch (error: unknown) {
      throw new Error(`Failed to load JSON config from ${filePath}: ${getErrorMessage(error)}`, { cause: error });
    }
  }

  /**
   * Load configuration from JSON object
   */
  private loadFromData(data: Record<string, unknown>): void {
    const flattened = GOConfigObjectFlattener.flatten(data);
    for (const [key, value] of flattened) {
      this.values.set(key, value);
    }
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
