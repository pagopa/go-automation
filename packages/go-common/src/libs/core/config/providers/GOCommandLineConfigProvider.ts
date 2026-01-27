/**
 * Command Line Configuration Provider
 *
 * Reads configuration from command line arguments.
 * Supports multiple formats:
 * - --key value (separate arguments)
 * - --key=value (equals sign)
 * - --flag (boolean flag)
 * - --key val1 val2 (arrays)
 * - --key val1 --key val2 (repeated flags)
 * - --key val1,val2 (comma-separated)
 */

import { GOConfigProviderBase } from '../GOConfigProvider.js';
import { GOSecretRedactor, GOSecretsSpecifierFactory } from '../GOSecretsSpecifier.js';
import type { GOSecretsSpecifier } from '../GOSecretsSpecifier.js';
import { GOConfigKeyTransformer } from '../GOConfigKeyTransformer.js';
import { GOCLIArgumentParser } from '../parsers/GOCLIArgumentParser.js';

/**
 * Options for command line config provider
 */
export interface GOCommandLineConfigProviderOptions {
  /** Custom arguments (default: process.argv.slice(2)) */
  arguments?: string[];

  /** Secret detection specification */
  secretsSpecifier?: GOSecretsSpecifier;

  /** Schema for parsing (which flags are boolean, which are arrays) */
  schema?: {
    booleanFlags?: string[];
    arrayFlags?: string[];
  };
}

/**
 * Command line configuration provider
 */
export class GOCommandLineConfigProvider extends GOConfigProviderBase {
  protected values: Map<string, string | string[]>;
  private readonly secretRedactor: GOSecretRedactor;
  private readonly rawArgs: string[];

  constructor(options: GOCommandLineConfigProviderOptions = {}) {
    super();

    this.values = new Map();
    this.secretRedactor = new GOSecretRedactor(
      options.secretsSpecifier ?? GOSecretsSpecifierFactory.none(),
    );
    this.rawArgs = options.arguments ?? process.argv.slice(2);

    // Parse arguments
    this.parseArguments(options.schema);
  }

  getName(): string {
    return 'CommandLine';
  }

  isSecret(key: string): boolean {
    const value = this.getValue(key);
    if (value === undefined) return false;
    return this.secretRedactor.isSecret(key, value);
  }

  /**
   * Get value for a configuration key
   * Automatically converts hierarchical keys to CLI flag format
   */
  override getValue(key: string): string | string[] | undefined {
    // Try direct lookup first
    if (this.values.has(key)) {
      return this.values.get(key);
    }

    // Try converting from hierarchical format to CLI flag format
    // e.g., "http.timeout" -> "http-timeout"
    const cliKey = GOConfigKeyTransformer.fromCLIFlag(`--${key.replace(/\./g, '-')}`);
    if (this.values.has(cliKey)) {
      return this.values.get(cliKey);
    }

    return undefined;
  }

  /**
   * Check if provider has a key
   */
  override hasKey(key: string): boolean {
    if (this.values.has(key)) {
      return true;
    }

    const cliKey = GOConfigKeyTransformer.fromCLIFlag(`--${key.replace(/\./g, '-')}`);
    return this.values.has(cliKey);
  }

  /**
   * Parse command line arguments
   */
  private parseArguments(schema?: { booleanFlags?: string[]; arrayFlags?: string[] }): void {
    let parsed: Map<string, string | string[]>;

    if (schema) {
      parsed = GOCLIArgumentParser.parseWithSchema(this.rawArgs, schema);
    } else {
      parsed = GOCLIArgumentParser.parse(this.rawArgs);
    }

    // Normalize keys and store values
    parsed.forEach((value, flagName) => {
      // Store with normalized key (remove dashes, use dots)
      const normalizedKey = flagName.replace(/-/g, '.');
      this.values.set(normalizedKey, value);

      // Also store with original flag name for direct lookup
      this.values.set(flagName, value);
    });
  }

  /**
   * Get original command line arguments
   */
  getRawArguments(): string[] {
    return [...this.rawArgs];
  }

  /**
   * Get all flags that were provided
   */
  getProvidedFlags(): string[] {
    const flags = new Set<string>();

    this.rawArgs.forEach((arg) => {
      if (arg.startsWith('--')) {
        const part = arg.split('=')[0];
        if (part) {
          const flagName = part.replace(/^--/, '');
          flags.add(flagName);
        }
      } else if (arg.startsWith('-')) {
        const part = arg.split('=')[0];
        if (part) {
          const flagName = part.replace(/^-/, '');
          flags.add(flagName);
        }
      }
    });

    return Array.from(flags);
  }
}
