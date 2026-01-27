/**
 * Configuration Reader
 *
 * Main interface for reading configuration from multiple providers.
 * Supports provider hierarchies, type conversion, and access tracking.
 */

import type { GOConfigProvider } from './GOConfigProvider.js';
import { GOConfigTypeConverter } from './GOConfigTypeConverter.js';

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
export class GOConfigReader {
  private readonly providers: GOConfigProvider[];
  private readonly accessLog: Map<
    string,
    { provider: string; count: number; isSecret: boolean; value?: string | string[] | undefined }
  >;

  /**
   * Create a configuration reader
   * @param providers - Single provider or array of providers (checked in order)
   */
  constructor(providers: GOConfigProvider | GOConfigProvider[]) {
    this.providers = Array.isArray(providers) ? providers : [providers];
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
  buffer(
    forKey: string,
    defaultValue?: Buffer,
    encoding: BufferEncoding = 'base64',
  ): Buffer | undefined {
    const value = this.getRawValue(forKey);
    if (value === undefined) return defaultValue;

    try {
      return GOConfigTypeConverter.toBuffer(value, encoding);
    } catch (error: any) {
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
    } catch (error: any) {
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
   * Log access to a configuration key
   */
  private logAccess(
    key: string,
    providerName: string,
    isSecret: boolean,
    value?: string | string[],
  ): void {
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
  private logConversionError(key: string, targetType: string, error: Error): void {
    console.warn(`[GOConfigReader] Failed to convert "${key}" to ${targetType}: ${error.message}`);
  }

  /**
   * Get access report
   * @returns Detailed report of configuration access
   */
  getAccessReport(): GOConfigAccessReport {
    const accessedKeys: GOConfigAccessLogEntry[] = [];
    const providerUsageStats = new Map<string, number>();
    let totalAccesses = 0;

    this.accessLog.forEach((log, key) => {
      accessedKeys.push({
        key,
        provider: log.provider,
        accessCount: log.count,
        isSecret: log.isSecret,
        lastValue: log.value,
      });

      totalAccesses += log.count;

      if (log.provider !== 'NONE') {
        providerUsageStats.set(log.provider, (providerUsageStats.get(log.provider) || 0) + 1);
      }
    });

    // Find unused providers
    const usedProviders = new Set(providerUsageStats.keys());
    const unusedProviders = this.providers
      .map((p) => p.getName())
      .filter((name) => !usedProviders.has(name));

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

    console.log('\n=== Configuration Access Report ===');
    console.log(`Total accesses: ${report.totalAccesses}`);
    console.log(`Unique keys accessed: ${report.accessedKeys.length}`);

    console.log('\nProvider Usage:');
    report.providerUsageStats.forEach((count, provider) => {
      console.log(`  ${provider}: ${count} keys`);
    });

    if (report.unusedProviders.length > 0) {
      console.log('\nUnused Providers:');
      report.unusedProviders.forEach((name) => {
        console.log(`  ${name}`);
      });
    }

    console.log('\nAccessed Keys:');
    report.accessedKeys
      .sort((a, b) => b.accessCount - a.accessCount)
      .forEach((entry) => {
        const value = entry.isSecret
          ? '[REDACTED]'
          : entry.lastValue !== undefined
            ? Array.isArray(entry.lastValue)
              ? `[${entry.lastValue.join(', ')}]`
              : entry.lastValue
            : 'NOT FOUND';

        console.log(
          `  ${entry.key}: ${value} (from ${entry.provider}, accessed ${entry.accessCount}x)`,
        );
      });

    console.log('===================================\n');
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
    this.providers.forEach((provider) => {
      provider.getAllKeys().forEach((key) => allKeys.add(key));
    });
    return Array.from(allKeys);
  }
}
