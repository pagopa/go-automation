/**
 * GOScript Config Loader
 * Handles configuration loading, validation, and source tracking
 */

import { GOConfigSchema } from '../config/GOConfigSchema.js';
import { GOConfigReader } from '../config/GOConfigReader.js';
import { GOConfigParameter } from '../config/GOConfigParameter.js';
import { GOConfigParameterType } from '../config/GOConfigParameterType.js';
import { GOConfigTypeConverter } from '../config/GOConfigTypeConverter.js';

/**
 * Configuration loading result
 */
export interface ConfigLoadResult {
  values: Record<string, unknown>;
  sources: Map<string, string>;
  missingRequired: string[];
}

/**
 * Config Loader for GOScript
 * Handles loading, validation, and source tracking of configuration values
 */
export class GOScriptConfigLoader {
  private readonly configSchema: GOConfigSchema;
  private readonly configReader: GOConfigReader;

  constructor(configSchema: GOConfigSchema, configReader: GOConfigReader) {
    this.configSchema = configSchema;
    this.configReader = configReader;
  }

  /**
   * Load configuration values from all providers
   */
  async load(): Promise<ConfigLoadResult> {
    // Load configuration values using type handlers (now async for fallback support)
    const configValues = await this.loadConfigValues();

    // Build source tracking
    const sources = this.buildSourceTracking();

    // Validate required parameters
    const missingRequired = this.validateRequiredParameters(configValues);

    return {
      values: configValues,
      sources,
      missingRequired,
    };
  }

  /**
   * Load configuration values using type strategy pattern.
   * Supports async fallback for parameters that define asyncFallback function.
   *
   * Resolution order for each parameter:
   * 1. Value from providers (CLI, config files, env vars) - respecting provider priority
   * 2. defaultValue (if set)
   * 3. asyncFallback (if set, awaited)
   *
   * Provider priority is respected across all keys (name + aliases):
   * A higher-priority provider (e.g., CLI) with an alias key wins over
   * a lower-priority provider (e.g., JSON config) with the primary key.
   */
  private async loadConfigValues(): Promise<Record<string, unknown>> {
    const configValues: Record<string, unknown> = {};
    const params = this.configSchema.getAllParameters();

    for (const param of params) {
      // Get raw value respecting provider priority across all keys (name + aliases)
      const keysToTry = [param.name, ...param.aliases];
      const rawValue = this.configReader.getRawValueForKeys(keysToTry);

      let value: unknown;

      if (rawValue !== undefined) {
        // Convert raw value using type handler
        value = this.convertRawValue(rawValue, param.type);
      }

      // If no value found, use default
      if (value === undefined && param.defaultValue !== undefined) {
        value = param.defaultValue;
      }

      // If still no value, try async fallback
      if (value === undefined && param.hasAsyncFallback()) {
        value = await param.asyncFallback?.();
      }

      if (value !== undefined) {
        configValues[param.name] = value;
      }
    }

    return configValues;
  }

  /**
   * Convert a raw value to the appropriate type based on parameter type
   */
  private convertRawValue(rawValue: string | string[], paramType: GOConfigParameterType): unknown {
    switch (paramType) {
      case GOConfigParameterType.INT:
        return GOConfigTypeConverter.toInt(rawValue);
      case GOConfigParameterType.DOUBLE:
        return GOConfigTypeConverter.toDouble(rawValue);
      case GOConfigParameterType.BOOL:
        return GOConfigTypeConverter.toBool(rawValue);
      case GOConfigParameterType.STRING:
        return GOConfigTypeConverter.toString(rawValue);
      case GOConfigParameterType.STRING_ARRAY:
        return GOConfigTypeConverter.toStringArray(rawValue);
      default:
        return GOConfigTypeConverter.toString(rawValue);
    }
  }

  /**
   * Build source tracking map from access report
   */
  private buildSourceTracking(): Map<string, string> {
    const sources = new Map<string, string>();
    const params = this.configSchema.getAllParameters();

    // Build a map from all possible keys (including aliases) to parameter names
    const keyToParamName = new Map<string, string>();
    for (const param of params) {
      keyToParamName.set(param.name, param.name);
      for (const alias of param.aliases) {
        keyToParamName.set(alias, param.name);
      }
    }

    // Get access report to track which provider supplied each value
    const accessReport = this.configReader.getAccessReport();
    for (const entry of accessReport.accessedKeys) {
      // Map the accessed key (which might be an alias) back to the parameter name
      const paramName = keyToParamName.get(entry.key);
      if (paramName) {
        sources.set(paramName, entry.provider);
      }
    }

    return sources;
  }

  /**
   * Validate required parameters and return list of missing ones
   */
  private validateRequiredParameters(configValues: Record<string, unknown>): string[] {
    const missingRequired: string[] = [];
    const params = this.configSchema.getAllParameters();

    for (const param of params) {
      if (param.required && (configValues[param.name] === undefined || configValues[param.name] === null)) {
        missingRequired.push(param.name);
      }
    }

    return missingRequired;
  }

  /**
   * Format parameter name for display in error messages
   */
  static formatParameterName(param: GOConfigParameter): string {
    const kebabName = param.name.replace(/\./g, '-');
    return `--${kebabName}`;
  }

  /**
   * Format missing parameters error message
   */
  static formatMissingParametersError(missingRequired: string[], params: GOConfigParameter[]): string {
    const paramMap = new Map(params.map((p) => [p.name, p]));
    const formatted = missingRequired
      .map((name) => {
        const param = paramMap.get(name);
        return param ? GOScriptConfigLoader.formatParameterName(param) : name;
      })
      .join(', ');

    return `Missing required parameters: ${formatted}\n`;
  }

  /**
   * Get configuration source display name
   */
  static getSourceDisplayName(source?: string): string {
    if (!source) return 'NONE';

    switch (source) {
      case 'CommandLine':
        return 'CommandLine';
      case 'Environment':
        return 'Environment';
      case 'JSONFile':
      case 'YAMLFile':
        return 'ConfigFile';
      default:
        return source || 'Unknown';
    }
  }
}
