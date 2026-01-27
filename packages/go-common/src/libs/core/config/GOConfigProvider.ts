/**
 * Configuration Provider Interface
 *
 * Base interface for all configuration providers.
 * Providers read configuration from different sources (env vars, files, CLI args, etc.)
 */

/**
 * Base interface for configuration providers
 */
export interface GOConfigProvider {
  /**
   * Get raw value for a configuration key
   * @param key - Configuration key (e.g., "http.timeout")
   * @returns String value, array of strings, or undefined if not found
   */
  getValue(key: string): string | string[] | undefined;

  /**
   * Check if provider has a value for the given key
   * @param key - Configuration key
   * @returns True if provider has the key
   */
  hasKey(key: string): boolean;

  /**
   * Get all available keys from this provider
   * @returns Array of all configuration keys
   */
  getAllKeys(): string[];

  /**
   * Check if a key should be treated as secret
   * @param key - Configuration key
   * @returns True if the key contains secret data
   */
  isSecret(key: string): boolean;

  /**
   * Get provider name for debugging
   * @returns Human-readable provider name
   */
  getName(): string;

  /**
   * Get redacted value for display/logging
   * @param key - Configuration key
   * @returns Redacted value if secret, original value otherwise
   */
  getDisplayValue(key: string): string | string[] | undefined;
}

/**
 * Abstract base class for configuration providers
 */
export abstract class GOConfigProviderBase implements GOConfigProvider {
  protected abstract values: Map<string, string | string[]>;

  abstract getName(): string;
  abstract isSecret(key: string): boolean;

  getValue(key: string): string | string[] | undefined {
    return this.values.get(key);
  }

  hasKey(key: string): boolean {
    return this.values.has(key);
  }

  getAllKeys(): string[] {
    return Array.from(this.values.keys());
  }

  getDisplayValue(key: string): string | string[] | undefined {
    const value = this.getValue(key);
    if (value === undefined) return undefined;

    if (this.isSecret(key)) {
      if (Array.isArray(value)) {
        return `[REDACTED (${value.length} items)]`;
      }
      return `[REDACTED (${value.length} chars)]`;
    }

    return value;
  }

  /**
   * Get a string representation of this provider for debugging
   */
  toString(): string {
    const keys = this.getAllKeys();
    const lines = [`${this.getName()} (${keys.length} keys)`];

    keys.forEach((key) => {
      const displayValue = this.getDisplayValue(key);
      const valueStr = Array.isArray(displayValue) ? `[${displayValue.join(', ')}]` : displayValue;
      lines.push(`  ${key}: ${valueStr}`);
    });

    return lines.join('\n');
  }
}
