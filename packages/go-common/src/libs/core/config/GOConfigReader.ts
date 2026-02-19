/**
 * Configuration Reader
 *
 * Main interface for reading configuration from multiple providers.
 * Supports provider hierarchies, type conversion, and access tracking.
 */

import type { GOConfigProvider } from './GOConfigProvider.js';
import { GOConfigTypeConverter } from './GOConfigTypeConverter.js';
import { getErrorMessage } from '../errors/GOErrorUtils.js';

/**
 * Access log entry for a configuration key
 */
export interface GOConfigAccessLogEntry {
  key: string;
  provider: string;
  accessCount: number;
  isSecret: boolean;
  lastValue?: string | string[] | undefined;
}

/**
 * Access report for configuration usage
 */
export interface GOConfigAccessReport {
  accessedKeys: GOConfigAccessLogEntry[];
  unusedProviders: string[];
  providerUsageStats: Map<string, number>;
  totalAccesses: number;
}

/**
 * Configuration reader with provider hierarchy support
 */
interface GOConfigProvideLog {
  provider: string;
  count: number;
  isSecret: boolean;
  value?: string | string[] | undefined;
}

export class GOConfigReader {
  private readonly providers: ReadonlyArray<GOConfigProvider>;
  private readonly accessLog: Map<string, GOConfigProvideLog>;

  /**
   * Create a configuration reader
   * @param providers - Single provider or array of providers (checked in order)
   */
  constructor(providers: ReadonlyArray<GOConfigProvider>) {
    this.providers = providers;
    this.accessLog = new Map();

    if (this.providers.length === 0) {
      throw new Error('GOConfigReader requires at least one provider');
    }
  }

  /**
   * Get string value
   * @param forKey - Configuration key
   * @param defaultValue - Default value if key not found
   * @returns String value or default
   */
  string(forKey: string, defaultValue?: string): string | undefined {
    const value = this.getRawValue(forKey);
    if (value === undefined) return defaultValue;

    try {
      return GOConfigTypeConverter.toString(value);
    } catch (error: unknown) {
      this.logConversionError(forKey, 'string', error);
      return defaultValue;
    }
  }

  /**
   * Get integer value
   * @param forKey - Configuration key
   * @param defaultValue - Default value if key not found or conversion fails
   * @returns Integer value or default
   */
  int(forKey: string, defaultValue?: number): number | undefined {
    const value = this.getRawValue(forKey);
    if (value === undefined) return defaultValue;

    try {
      return GOConfigTypeConverter.toInt(value);
    } catch (error: unknown) {
      this.logConversionError(forKey, 'int', error);
      return defaultValue;
    }
  }

  /**
   * Get double/float value
   * @param forKey - Configuration key
   * @param defaultValue - Default value if key not found or conversion fails
   * @returns Number value or default
   */
  double(forKey: string, defaultValue?: number): number | undefined {
    const value = this.getRawValue(forKey);
    if (value === undefined) return defaultValue;

    try {
      return GOConfigTypeConverter.toDouble(value);
    } catch (error: unknown) {
      this.logConversionError(forKey, 'double', error);
      return defaultValue;
    }
  }

  /**
   * Get boolean value
   * @param forKey - Configuration key
   * @param defaultValue - Default value if key not found or conversion fails
   * @returns Boolean value or default
   */
  bool(forKey: string, defaultValue?: boolean): boolean | undefined {
    const value = this.getRawValue(forKey);
    if (value === undefined) return defaultValue;

    try {
      return GOConfigTypeConverter.toBool(value);
    } catch (error: unknown) {
      this.logConversionError(forKey, 'bool', error);
      return defaultValue;
    }
  }

  /**
   * Get string array value
   * @param forKey - Configuration key
   * @param defaultValue - Default value if key not found
   * @param separator - Separator for splitting strings (default: ',')
   * @returns Array of strings or default
   */
  stringArray(forKey: string, defaultValue?: string[], separator = ','): string[] | undefined {
    const value = this.getRawValue(forKey);
    if (value === undefined) return defaultValue;

    try {
      return GOConfigTypeConverter.toStringArray(value, separator);
    } catch (error: unknown) {
      this.logConversionError(forKey, 'stringArray', error);
      return defaultValue;
    }
  }

  /**
   * Get integer array value
   * @param forKey - Configuration key
   * @param defaultValue - Default value if key not found or conversion fails
   * @param separator - Separator for splitting strings (default: ',')
   * @returns Array of integers or default
   */
  intArray(forKey: string, defaultValue?: number[], separator = ','): number[] | undefined {
    const value = this.getRawValue(forKey);
    if (value === undefined) return defaultValue;

    try {
      return GOConfigTypeConverter.toIntArray(value, separator);
    } catch (error: unknown) {
      this.logConversionError(forKey, 'intArray', error);
      return defaultValue;
    }
  }

  /**
   * Get double array value
   * @param forKey - Configuration key
   * @param defaultValue - Default value if key not found or conversion fails
   * @param separator - Separator for splitting strings (default: ',')
   * @returns Array of numbers or default
   */
  doubleArray(forKey: string, defaultValue?: number[], separator = ','): number[] | undefined {
    const value = this.getRawValue(forKey);
    if (value === undefined) return defaultValue;

    try {
      return GOConfigTypeConverter.toDoubleArray(value, separator);
    } catch (error: unknown) {
      this.logConversionError(forKey, 'doubleArray', error);
      return defaultValue;
    }
  }

  /**
   * Get boolean array value
   * @param forKey - Configuration key
   * @param defaultValue - Default value if key not found or conversion fails
   * @param separator - Separator for splitting strings (default: ',')
   * @returns Array of booleans or default
   */
  boolArray(forKey: string, defaultValue?: boolean[], separator = ','): boolean[] | undefined {
    const value = this.getRawValue(forKey);
    if (value === undefined) return defaultValue;

    try {
      return GOConfigTypeConverter.toBoolArray(value, separator);
    } catch (error: unknown) {
      this.logConversionError(forKey, 'boolArray', error);
      return defaultValue;
    }
  }

  /**
   * Get Buffer value
   * @param forKey - Configuration key
   * @param defaultValue - Default value if key not found or conversion fails
   * @param encoding - Buffer encoding (default: 'base64')
   * @returns Buffer or default
   */
  buffer(forKey: string, defaultValue?: Buffer, encoding: BufferEncoding = 'base64'): Buffer | undefined {
    const value = this.getRawValue(forKey);
    if (value === undefined) return defaultValue;

    try {
      return GOConfigTypeConverter.toBuffer(value, encoding);
    } catch (error: unknown) {
      this.logConversionError(forKey, 'buffer', error);
      return defaultValue;
    }
  }

  /**
   * Get Buffer array value
   * @param forKey - Configuration key
   * @param defaultValue - Default value if key not found or conversion fails
   * @param separator - Separator for splitting strings (default: ',')
   * @param encoding - Buffer encoding (default: 'base64')
   * @returns Array of Buffers or default
   */
  bufferArray(
    forKey: string,
    defaultValue?: Buffer[],
    separator = ',',
    encoding: BufferEncoding = 'base64',
  ): Buffer[] | undefined {
    const value = this.getRawValue(forKey);
    if (value === undefined) return defaultValue;

    try {
      return GOConfigTypeConverter.toBufferArray(value, separator, encoding);
    } catch (error: unknown) {
      this.logConversionError(forKey, 'bufferArray', error);
      return defaultValue;
    }
  }

  /**
   * Get raw value from the first provider that has it
   */
  private getRawValue(key: string): string | string[] | undefined {
    for (const provider of this.providers) {
      if (provider.hasKey(key)) {
        const value = provider.getValue(key);
        this.logAccess(key, provider.getName(), provider.isSecret(key), value);
        return value;
      }
    }

    this.logMissing(key);
    return undefined;
  }

  /**
   * Get raw value trying multiple keys, respecting provider priority.
   * For each provider (in priority order), tries all keys before moving to the next provider.
   * This ensures a higher-priority provider with an alias key wins over
   * a lower-priority provider with the primary key.
   *
   * @param keys - Keys to try (e.g., [param.name, ...param.aliases])
   * @returns The raw value from the highest-priority provider that has any of the keys
   */
  getRawValueForKeys(keys: ReadonlyArray<string>): string | string[] | undefined {
    for (const provider of this.providers) {
      for (const key of keys) {
        if (provider.hasKey(key)) {
          const value = provider.getValue(key);
          this.logAccess(key, provider.getName(), provider.isSecret(key), value);
          return value;
        }
      }
    }

    for (const key of keys) {
      this.logMissing(key);
    }
    return undefined;
  }

  /**
   * Log access to a configuration key
   */
  private logAccess(key: string, providerName: string, isSecret: boolean, value?: string | string[]): void {
    const existing = this.accessLog.get(key);
    if (existing) {
      existing.count++;
    } else {
      this.accessLog.set(key, {
        provider: providerName,
        count: 1,
        isSecret,
        value: isSecret ? undefined : value,
      });
    }
  }

  /**
   * Log missing key access
   */
  private logMissing(key: string): void {
    // Don't overwrite existing log entries
    if (!this.accessLog.has(key)) {
      this.accessLog.set(key, {
        provider: 'NONE',
        count: 1,
        isSecret: false,
      });
    }
  }

  /**
   * Log type conversion error
   */
  private logConversionError(key: string, targetType: string, error: unknown): void {
    console.warn(`[GOConfigReader] Failed to convert "${key}" to ${targetType}: ${getErrorMessage(error)}`);
  }

  /**
   * Get access report
   * @returns Detailed report of configuration access
   */
  getAccessReport(): GOConfigAccessReport {
    const accessedKeys: GOConfigAccessLogEntry[] = [];
    const providerUsageStats = new Map<string, number>();
    let totalAccesses = 0;

    for (const [key, log] of this.accessLog) {
      accessedKeys.push({
        key,
        provider: log.provider,
        accessCount: log.count,
        isSecret: log.isSecret,
        lastValue: log.value,
      });

      totalAccesses += log.count;

      if (log.provider !== 'NONE') {
        providerUsageStats.set(log.provider, (providerUsageStats.get(log.provider) ?? 0) + 1);
      }
    }

    // Find unused providers
    const usedProviders = new Set(providerUsageStats.keys());
    const unusedProviders = this.providers.map((p) => p.getName()).filter((name) => !usedProviders.has(name));

    return {
      accessedKeys,
      unusedProviders,
      providerUsageStats,
      totalAccesses,
    };
  }

  /**
   * Print access report to console
   */
  printReport(): void {
    const report = this.getAccessReport();

    process.stdout.write('\n=== Configuration Access Report ===\n');
    process.stdout.write(`Total accesses: ${report.totalAccesses}\n`);
    process.stdout.write(`Unique keys accessed: ${report.accessedKeys.length}\n`);

    process.stdout.write('\nProvider Usage:\n');
    for (const [provider, count] of report.providerUsageStats) {
      process.stdout.write(`  ${provider}: ${count} keys\n`);
    }

    if (report.unusedProviders.length > 0) {
      process.stdout.write('\nUnused Providers:\n');
      for (const name of report.unusedProviders) {
        process.stdout.write(`  ${name}\n`);
      }
    }

    process.stdout.write('\nAccessed Keys:\n');
    const sortedKeys = [...report.accessedKeys].sort((a, b) => b.accessCount - a.accessCount);
    for (const entry of sortedKeys) {
      const value = entry.isSecret
        ? '[REDACTED]'
        : entry.lastValue !== undefined
          ? Array.isArray(entry.lastValue)
            ? `[${entry.lastValue.join(', ')}]`
            : entry.lastValue
          : 'NOT FOUND';

      process.stdout.write(`  ${entry.key}: ${value} (from ${entry.provider}, accessed ${entry.accessCount}x)\n`);
    }

    process.stdout.write('===================================\n\n');
  }

  /**
   * Get provider chain (order of providers)
   */
  getProviderChain(): string[] {
    return this.providers.map((p) => p.getName());
  }

  /**
   * Get all providers
   */
  getProviders(): GOConfigProvider[] {
    return [...this.providers];
  }

  /**
   * Check if a key exists in any provider
   */
  hasKey(key: string): boolean {
    return this.providers.some((p) => p.hasKey(key));
  }

  /**
   * Get all available keys from all providers
   */
  getAllKeys(): string[] {
    const allKeys = new Set<string>();
    for (const provider of this.providers) {
      for (const key of provider.getAllKeys()) {
        allKeys.add(key);
      }
    }
    return Array.from(allKeys);
  }
}
