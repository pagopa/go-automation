/**
 * Configuration Parameter
 *
 * Defines a configuration parameter with metadata for validation,
 * help generation, and type-safe access.
 */

import { GOConfigParameterType, getTypePlaceholder } from './GOConfigParameterType.js';
import { GOConfigReader } from './GOConfigReader.js';
import { GOConfigKeyTransformer } from './GOConfigKeyTransformer.js';

/**
 * Union type for all possible configuration parameter values.
 * Corresponds to the types supported by GOConfigParameterType.
 */
export type GOConfigParameterValue =
  | string
  | number
  | boolean
  | Buffer
  | ReadonlyArray<string>
  | ReadonlyArray<number>
  | ReadonlyArray<boolean>
  | ReadonlyArray<Buffer>;

/**
 * Async fallback function type.
 * Called when parameter value is not found in any provider and no defaultValue is set.
 *
 * @template T - The expected return type matching the parameter type
 *
 * @example
 * ```typescript
 * const loadPatterns: GOConfigParameterFallback<string[]> = async () => {
 *   const data = await fs.readFile('patterns.json', 'utf-8');
 *   return JSON.parse(data);
 * };
 * ```
 */
export type GOConfigParameterFallback<T extends GOConfigParameterValue = GOConfigParameterValue> =
  () => Promise<T>;

/**
 * Configuration parameter definition
 */
export interface GOConfigParameterOptions {
  /** Parameter key (e.g., "server.url") */
  name: string;

  /** Display name for UI/help (e.g., "Server URL") */
  displayName?: string;

  /** Parameter type */
  type: GOConfigParameterType;

  /** Short description (one line) */
  abstract?: string;

  /** Detailed description (multiple lines) */
  description?: string;

  /** Extended help with examples */
  help?: string;

  /** Default value */
  defaultValue?: GOConfigParameterValue;

  /** Whether this parameter is required */
  required?: boolean;

  /** Group/category for organizing help output */
  group?: string;

  /** Environment variable name (auto-generated if not specified) */
  envVar?: string;

  /** CLI flag name (auto-generated if not specified) */
  cliFlag?: string;

  /** Custom placeholder for help (e.g., "<port>", "<url>") */
  placeholder?: string;

  /** Validation function */
  validator?: (value: GOConfigParameterValue) => boolean | string;

  /** Aliases for CLI flags */
  aliases?: string[] | undefined;

  /** Whether this parameter is deprecated */
  deprecated?: boolean;

  /** Deprecation message */
  deprecationMessage?: string;

  /**
   * Async fallback function called when value is not found in providers.
   * Executed AFTER checking defaultValue.
   * If both defaultValue and asyncFallback are set, defaultValue takes precedence.
   *
   * Use case: Load default patterns from external file, fetch from API, etc.
   *
   * @example
   * ```typescript
   * {
   *   name: 'ignore.patterns',
   *   type: GOConfigParameterType.STRING_ARRAY,
   *   required: false,
   *   asyncFallback: async () => loadPatternsFromFile('./defaults.json'),
   * }
   * ```
   */
  asyncFallback?: GOConfigParameterFallback | undefined;
}

/**
 * Configuration parameter with metadata
 */
export class GOConfigParameter {
  readonly name: string;
  readonly displayName: string;
  readonly type: GOConfigParameterType;
  readonly abstract?: string | undefined;
  readonly description?: string | undefined;
  readonly help?: string | undefined;
  readonly defaultValue?: GOConfigParameterValue | undefined;
  readonly required: boolean;
  readonly group: string;
  readonly envVar: string;
  readonly cliFlag: string;
  readonly placeholder: string;
  readonly validator?: ((value: GOConfigParameterValue) => boolean | string) | undefined;
  readonly aliases: string[];
  readonly deprecated: boolean;
  readonly deprecationMessage?: string | undefined;
  readonly asyncFallback?: GOConfigParameterFallback | undefined;

  constructor(options: GOConfigParameterOptions) {
    this.name = options.name;
    this.displayName = options.displayName ?? this.generateDisplayName(options.name);
    this.type = options.type;
    this.abstract = options.abstract;
    this.description = options.description;
    this.help = options.help;
    this.defaultValue = options.defaultValue;
    this.required = options.required ?? false;
    this.group = options.group ?? 'General';
    this.envVar = options.envVar ?? GOConfigKeyTransformer.toEnvironmentKey(options.name);
    this.cliFlag = options.cliFlag ?? GOConfigKeyTransformer.toCLIFlag(options.name);
    this.placeholder = options.placeholder ?? getTypePlaceholder(options.type);
    this.validator = options.validator;
    this.aliases = options.aliases ?? [];
    this.deprecated = options.deprecated ?? false;
    this.deprecationMessage = options.deprecationMessage;
    this.asyncFallback = options.asyncFallback;
  }

  /**
   * Generate display name from parameter name
   * e.g., "server.url" -> "Server Url"
   */
  private generateDisplayName(name: string): string {
    return name
      .split('.')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  /**
   * Get value from config reader with type safety
   */
  getValue(config: GOConfigReader): GOConfigParameterValue | undefined {
    const value = this.getValueInternal(config);

    // Validate if validator is provided
    if (value !== undefined && this.validator) {
      const validationResult = this.validator(value);
      if (validationResult !== true) {
        const message =
          typeof validationResult === 'string'
            ? validationResult
            : `Validation failed for parameter "${this.name}"`;
        throw new Error(message);
      }
    }

    // Check required
    if (this.required && value === undefined) {
      throw new Error(`Required parameter "${this.name}" is missing`);
    }

    return value;
  }

  /**
   * Get value with async fallback support.
   * Resolution order:
   * 1. Value from providers (CLI, config files, env vars)
   * 2. defaultValue (if set)
   * 3. asyncFallback (if set, awaited)
   * 4. undefined
   *
   * @param config - Configuration reader
   * @returns Promise resolving to the parameter value
   *
   * @example
   * ```typescript
   * const value = await param.getValueAsync(configReader);
   * ```
   */
  async getValueAsync(config: GOConfigReader): Promise<GOConfigParameterValue | undefined> {
    let value: GOConfigParameterValue | undefined = this.getValueInternal(config);

    // Use async fallback if still no value
    if (value === undefined && this.asyncFallback) {
      value = await this.asyncFallback();
    }

    // Validate if validator is provided
    if (value !== undefined && this.validator) {
      const validationResult = this.validator(value);
      if (validationResult !== true) {
        const message =
          typeof validationResult === 'string'
            ? validationResult
            : `Validation failed for parameter "${this.name}"`;
        throw new Error(message);
      }
    }

    // Check required
    if (this.required && value === undefined) {
      throw new Error(`Required parameter "${this.name}" is missing`);
    }

    return value;
  }

  /**
   * Check if this parameter has an async fallback configured
   */
  hasAsyncFallback(): boolean {
    return this.asyncFallback !== undefined;
  }

  /**
   * Internal method to get value based on type.
   * Each case extracts the appropriate default value type from the union.
   */
  private getValueInternal(config: GOConfigReader): GOConfigParameterValue | undefined {
    // Helper to safely extract typed default values from the union
    const defaultVal = this.defaultValue;

    switch (this.type) {
      case GOConfigParameterType.STRING:
        return config.string(this.name, typeof defaultVal === 'string' ? defaultVal : undefined);

      case GOConfigParameterType.INT:
        return config.int(this.name, typeof defaultVal === 'number' ? defaultVal : undefined);

      case GOConfigParameterType.DOUBLE:
        return config.double(this.name, typeof defaultVal === 'number' ? defaultVal : undefined);

      case GOConfigParameterType.BOOL:
        return config.bool(this.name, typeof defaultVal === 'boolean' ? defaultVal : undefined);

      case GOConfigParameterType.STRING_ARRAY: {
        const stringDefault = this.isStringArray(defaultVal) ? [...defaultVal] : undefined;
        return config.stringArray(this.name, stringDefault);
      }

      case GOConfigParameterType.INT_ARRAY: {
        const intDefault = this.isNumberArray(defaultVal) ? [...defaultVal] : undefined;
        return config.intArray(this.name, intDefault);
      }

      case GOConfigParameterType.DOUBLE_ARRAY: {
        const doubleDefault = this.isNumberArray(defaultVal) ? [...defaultVal] : undefined;
        return config.doubleArray(this.name, doubleDefault);
      }

      case GOConfigParameterType.BOOL_ARRAY: {
        const boolDefault = this.isBooleanArray(defaultVal) ? [...defaultVal] : undefined;
        return config.boolArray(this.name, boolDefault);
      }

      case GOConfigParameterType.BUFFER:
        return config.buffer(this.name, Buffer.isBuffer(defaultVal) ? defaultVal : undefined);

      case GOConfigParameterType.BUFFER_ARRAY: {
        const bufferDefault = this.isBufferArray(defaultVal) ? [...defaultVal] : undefined;
        return config.bufferArray(this.name, bufferDefault);
      }

      default:
        return config.string(this.name, typeof defaultVal === 'string' ? defaultVal : undefined);
    }
  }

  /**
   * Type guard for string arrays
   */
  private isStringArray(value: GOConfigParameterValue | undefined): value is ReadonlyArray<string> {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
  }

  /**
   * Type guard for number arrays
   */
  private isNumberArray(value: GOConfigParameterValue | undefined): value is ReadonlyArray<number> {
    return Array.isArray(value) && value.every((item) => typeof item === 'number');
  }

  /**
   * Type guard for boolean arrays
   */
  private isBooleanArray(
    value: GOConfigParameterValue | undefined,
  ): value is ReadonlyArray<boolean> {
    return Array.isArray(value) && value.every((item) => typeof item === 'boolean');
  }

  /**
   * Type guard for Buffer arrays
   */
  private isBufferArray(value: GOConfigParameterValue | undefined): value is ReadonlyArray<Buffer> {
    return Array.isArray(value) && value.every((item) => Buffer.isBuffer(item));
  }

  /**
   * Get CLI flag with placeholder
   */
  getCliUsage(): string {
    const flag = this.cliFlag;
    const placeholder = this.placeholder;
    return placeholder ? `${flag} ${placeholder}` : flag;
  }

  /**
   * Get all CLI flags (including aliases)
   */
  getAllCliFlags(): string[] {
    return [this.cliFlag, ...this.aliases];
  }

  /**
   * Check if this parameter matches a CLI flag
   */
  matchesCliFlag(flag: string): boolean {
    return this.getAllCliFlags().some((f) => f === flag || f === `--${flag}` || f === `-${flag}`);
  }
}
