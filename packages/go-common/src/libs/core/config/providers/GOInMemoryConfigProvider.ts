/**
 * In-Memory Configuration Provider
 *
 * Stores configuration in memory. Useful for:
 * - Testing and mocking
 * - Default values
 * - Runtime configuration
 */

import { GOConfigProviderBase } from '../GOConfigProvider.js';
import { GOSecretRedactor, GOSecretsSpecifierFactory } from '../GOSecretsSpecifier.js';
import type { GOSecretsSpecifier } from '../GOSecretsSpecifier.js';

/**
 * Options for in-memory config provider
 */
export interface GOInMemoryConfigProviderOptions {
  /** Initial configuration values */
  values?: Record<string, string | string[]>;

  /** Secret detection specification */
  secretsSpecifier?: GOSecretsSpecifier;

  /** Provider name for debugging */
  name?: string;
}

/**
 * In-memory configuration provider
 */
export class GOInMemoryConfigProvider extends GOConfigProviderBase {
  protected values: Map<string, string | string[]>;
  private readonly secretRedactor: GOSecretRedactor;
  private readonly providerName: string;

  constructor(options: GOInMemoryConfigProviderOptions = {}) {
    super();

    this.values = new Map();
    this.secretRedactor = new GOSecretRedactor(
      options.secretsSpecifier ?? GOSecretsSpecifierFactory.none(),
    );
    this.providerName = options.name ?? 'InMemory';

    // Initialize with provided values
    if (options.values) {
      Object.entries(options.values).forEach(([key, value]) => {
        this.values.set(key, value);
      });
    }
  }

  getName(): string {
    return this.providerName;
  }

  isSecret(key: string): boolean {
    const value = this.getValue(key);
    if (value === undefined) return false;
    return this.secretRedactor.isSecret(key, value);
  }

  /**
   * Set a configuration value
   * @param key - Configuration key
   * @param value - Configuration value
   */
  setValue(key: string, value: string | string[]): void {
    this.values.set(key, value);
  }

  /**
   * Set multiple configuration values
   * @param values - Record of key-value pairs
   */
  setValues(values: Record<string, string | string[]>): void {
    Object.entries(values).forEach(([key, value]) => {
      this.values.set(key, value);
    });
  }

  /**
   * Remove a configuration value
   * @param key - Configuration key
   */
  removeValue(key: string): void {
    this.values.delete(key);
  }

  /**
   * Clear all configuration values
   */
  clear(): void {
    this.values.clear();
  }
}
