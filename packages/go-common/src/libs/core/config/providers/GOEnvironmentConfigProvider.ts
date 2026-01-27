/**
 * Environment Configuration Provider
 *
 * Reads configuration from environment variables.
 * Supports:
 * - Current process environment (process.env)
 * - .env files
 * - Automatic key transformation (http.timeout -> HTTP_TIMEOUT)
 * - Type conversion for all supported types
 */

import { GOConfigProviderBase } from '../GOConfigProvider.js';
import { GOSecretRedactor, GOSecretsSpecifierFactory } from '../GOSecretsSpecifier.js';
import type { GOSecretsSpecifier } from '../GOSecretsSpecifier.js';
import { GOConfigKeyTransformer } from '../GOConfigKeyTransformer.js';
import { GOEnvFileParser } from '../parsers/GOEnvFileParser.js';

/**
 * Options for environment config provider
 */
export interface GOEnvironmentConfigProviderOptions {
  /** Path to .env file (optional) */
  environmentFilePath?: string;

  /** Secret detection specification */
  secretsSpecifier?: GOSecretsSpecifier;

  /** File encoding for .env file (default: 'utf8') */
  encoding?: BufferEncoding;

  /** Custom environment source (default: process.env) */
  source?: NodeJS.ProcessEnv | Record<string, string>;

  /** Array separator for parsing array values (default: ',') */
  arraySeparator?: string;

  /** Custom display name for this provider (overrides default Environment(path) format) */
  displayName?: string;
}

/**
 * Environment configuration provider
 */
export class GOEnvironmentConfigProvider extends GOConfigProviderBase {
  protected values: Map<string, string | string[]>;
  private readonly secretRedactor: GOSecretRedactor;
  private readonly envFilePath?: string | undefined;
  private readonly arraySeparator: string;
  private readonly displayName?: string | undefined;

  constructor(options: GOEnvironmentConfigProviderOptions = {}) {
    super();

    this.values = new Map();
    this.secretRedactor = new GOSecretRedactor(
      options.secretsSpecifier ?? GOSecretsSpecifierFactory.none(),
    );
    this.envFilePath = options.environmentFilePath;
    this.arraySeparator = options.arraySeparator ?? ',';
    this.displayName = options.displayName;

    // Load environment variables
    if (options.environmentFilePath) {
      try {
        this.loadFromFile(options.environmentFilePath, options.encoding ?? 'utf8');
      } catch (error) {
        // Fallback to process.env if file doesn't exist or can't be read
        this.loadFromEnvironment(options.source ?? process.env);
      }
    } else {
      this.loadFromEnvironment(options.source ?? process.env);
    }
  }

  getName(): string {
    if (this.displayName) {
      return this.displayName;
    }
    return this.envFilePath ? `Environment(${this.envFilePath})` : 'Environment';
  }

  isSecret(key: string): boolean {
    const value = this.getValue(key);
    if (value === undefined) return false;
    return this.secretRedactor.isSecret(key, value);
  }

  /**
   * Get value for a configuration key
   * Automatically converts hierarchical keys to environment variable format
   */
  override getValue(key: string): string | string[] | undefined {
    // Try direct lookup first (in case the key is already in env var format)
    if (this.values.has(key)) {
      return this.values.get(key);
    }

    // Try converting to environment variable format
    const envKey = GOConfigKeyTransformer.toEnvironmentKey(key);
    return this.values.get(envKey);
  }

  /**
   * Check if provider has a key
   */
  override hasKey(key: string): boolean {
    if (this.values.has(key)) {
      return true;
    }

    const envKey = GOConfigKeyTransformer.toEnvironmentKey(key);
    return this.values.has(envKey);
  }

  /**
   * Load from .env file
   */
  private loadFromFile(filePath: string, encoding: BufferEncoding): void {
    try {
      const parsed = GOEnvFileParser.parseFile(filePath, encoding);
      parsed.forEach((value, key) => {
        this.values.set(key, this.parseArrayValue(value));
      });
    } catch (error: any) {
      throw new Error(`Failed to load environment file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Load from environment object
   */
  private loadFromEnvironment(env: NodeJS.ProcessEnv | Record<string, string>): void {
    Object.entries(env).forEach(([key, value]) => {
      if (value !== undefined) {
        this.values.set(key, this.parseArrayValue(value));
      }
    });
  }

  /**
   * Parse value as potential array (comma-separated)
   */
  private parseArrayValue(value: string): string | string[] {
    if (value.includes(this.arraySeparator)) {
      const parts = value
        .split(this.arraySeparator)
        .map((v) => v.trim())
        .filter((v) => v.length > 0);

      // Return array only if we have multiple parts
      return parts.length > 1 ? parts : value;
    }

    return value;
  }

  /**
   * Reload configuration from file (only works if initialized with environmentFilePath)
   */
  reload(encoding: BufferEncoding = 'utf8'): void {
    if (!this.envFilePath) {
      throw new Error('Cannot reload: provider was not initialized with environmentFilePath');
    }

    this.values.clear();
    this.loadFromFile(this.envFilePath, encoding);
  }

  /**
   * Reload from current process environment
   */
  reloadFromProcess(): void {
    this.values.clear();
    this.loadFromEnvironment(process.env);
  }
}
