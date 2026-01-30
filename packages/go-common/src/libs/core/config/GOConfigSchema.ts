/**
 * Configuration Schema
 *
 * Defines and manages a schema of configuration parameters with
 * automatic help generation and validation.
 */

import { GOConfigParameter } from './GOConfigParameter.js';
import type { GOConfigParameterOptions } from './GOConfigParameter.js';
import { GOConfigReader } from './GOConfigReader.js';
import { GOConfigHelpGenerator } from './GOConfigHelpGenerator.js';
import type { GOConfigHelpGeneratorOptions } from './GOConfigHelpGenerator.js';
import { getErrorMessage } from '../errors/GOErrorUtils.js';
import { valueToString } from '../utils/GOValueToString.js';

/**
 * Configuration schema options
 */
export interface GOConfigSchemaOptions extends GOConfigHelpGeneratorOptions {
  /** Schema name */
  name?: string | undefined;

  /** Schema version */
  version?: string | undefined;
}

/**
 * Configuration schema with parameters and help generation
 */
export class GOConfigSchema {
  private readonly parameters: Map<string, GOConfigParameter>;
  private readonly helpGenerator: GOConfigHelpGenerator;
  readonly name: string;
  readonly version: string;

  constructor(options: GOConfigSchemaOptions = {}) {
    this.parameters = new Map();
    this.name = options.name ?? 'Configuration';
    this.version = options.version ?? '1.0.0';
    this.helpGenerator = new GOConfigHelpGenerator(options);
  }

  /**
   * Add a parameter to the schema
   */
  addParameter(options: GOConfigParameterOptions): GOConfigParameter {
    const parameter = new GOConfigParameter(options);
    this.parameters.set(parameter.name, parameter);
    return parameter;
  }

  /**
   * Add multiple parameters
   */
  addParameters(parameterOptions: GOConfigParameterOptions[]): void {
    parameterOptions.forEach((options) => this.addParameter(options));
  }

  /**
   * Get a parameter by name
   */
  getParameter(name: string): GOConfigParameter | undefined {
    return this.parameters.get(name);
  }

  /**
   * Get all parameters
   */
  getAllParameters(): GOConfigParameter[] {
    return Array.from(this.parameters.values());
  }

  /**
   * Get parameters by group
   */
  getParametersByGroup(group: string): GOConfigParameter[] {
    return this.getAllParameters().filter((p) => p.group === group);
  }

  /**
   * Get all groups
   */
  getAllGroups(): string[] {
    const groups = new Set<string>();
    this.getAllParameters().forEach((p) => groups.add(p.group));
    return Array.from(groups).sort();
  }

  /**
   * Get required parameters
   */
  getRequiredParameters(): GOConfigParameter[] {
    return this.getAllParameters().filter((p) => p.required);
  }

  /**
   * Get optional parameters
   */
  getOptionalParameters(): GOConfigParameter[] {
    return this.getAllParameters().filter((p) => !p.required);
  }

  /**
   * Find parameter by CLI flag
   */
  findByCliFlag(flag: string): GOConfigParameter | undefined {
    return this.getAllParameters().find((p) => p.matchesCliFlag(flag));
  }

  /**
   * Generate help text
   */
  generateHelp(): string {
    return this.helpGenerator.generate(this.getAllParameters());
  }

  /**
   * Generate compact help
   */
  generateCompactHelp(): string {
    return this.helpGenerator.generateCompact(this.getAllParameters());
  }

  /**
   * Generate help for a specific parameter
   */
  generateParameterHelp(name: string): string | undefined {
    const parameter = this.getParameter(name);
    if (!parameter) return undefined;
    return this.helpGenerator.generateParameterDetail(parameter);
  }

  /**
   * Print help to console
   */
  printHelp(): void {
    process.stdout.write(`${this.generateHelp()}\n`);
  }

  /**
   * Print compact help to console
   */
  printCompactHelp(): void {
    process.stdout.write(`${this.generateCompactHelp()}\n`);
  }

  /**
   * Load configuration from reader with validation
   */
  loadConfig(config: GOConfigReader): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const errors: string[] = [];

    this.getAllParameters().forEach((param) => {
      try {
        const value = param.getValue(config);
        if (value !== undefined) {
          result[param.name] = value;
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        errors.push(`${param.name}: ${message}`);
      }
    });

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }

    return result;
  }

  /**
   * Validate configuration
   */
  validate(config: GOConfigReader): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    this.getAllParameters().forEach((param) => {
      try {
        param.getValue(config);
      } catch (error: unknown) {
        errors.push(`${param.name}: ${getErrorMessage(error)}`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if --help flag is present in arguments
   */
  static hasHelpFlag(args: string[] = process.argv.slice(2)): boolean {
    return args.some((arg) => arg === '--help' || arg === '-h' || arg === 'help');
  }

  /**
   * Handle help flag automatically
   * Returns true if help was shown, false otherwise
   */
  handleHelpFlag(args: string[] = process.argv.slice(2)): boolean {
    if (GOConfigSchema.hasHelpFlag(args)) {
      this.printHelp();
      return true;
    }
    return false;
  }

  /**
   * Get usage string
   */
  getUsageString(): string {
    return this.helpGenerator.generateUsageString(this.getAllParameters());
  }

  /**
   * Export schema as JSON (for documentation)
   */
  toJSON(): unknown {
    return {
      name: this.name,
      version: this.version,
      parameters: this.getAllParameters().map((p) => ({
        name: p.name,
        displayName: p.displayName,
        type: p.type,
        group: p.group,
        required: p.required,
        defaultValue: p.defaultValue,
        abstract: p.abstract,
        description: p.description,
        cliFlag: p.cliFlag,
        envVar: p.envVar,
        aliases: p.aliases,
        deprecated: p.deprecated,
      })),
    };
  }

  /**
   * Generate markdown documentation
   */
  toMarkdown(): string {
    const lines: string[] = [];

    lines.push(`# ${this.name}`);
    lines.push('');
    lines.push(`Version: ${this.version}`);
    lines.push('');

    // Table of contents
    lines.push('## Table of Contents');
    lines.push('');
    this.getAllGroups().forEach((group) => {
      const anchor = group.toLowerCase().replace(/\s+/g, '-');
      lines.push(`- [${group}](#${anchor})`);
    });
    lines.push('');

    // Parameters by group
    this.getAllGroups().forEach((group) => {
      lines.push(`## ${group}`);
      lines.push('');

      const params = this.getParametersByGroup(group);
      params.forEach((param) => {
        lines.push(`### ${param.displayName}`);
        lines.push('');
        lines.push(`**Key:** \`${param.name}\``);
        lines.push('');
        lines.push(`**Type:** \`${param.type}\``);
        lines.push('');
        lines.push(`**CLI:** \`${param.cliFlag}\``);
        lines.push('');
        lines.push(`**Environment:** \`${param.envVar}\``);
        lines.push('');

        if (param.required) {
          lines.push('**Required:** Yes');
          lines.push('');
        }

        if (param.defaultValue !== undefined) {
          lines.push(`**Default:** \`${valueToString(param.defaultValue)}\``);
          lines.push('');
        }

        if (param.abstract) {
          lines.push(param.abstract);
          lines.push('');
        }

        if (param.description) {
          lines.push(param.description);
          lines.push('');
        }

        if (param.help) {
          lines.push('**Example:**');
          lines.push('');
          lines.push('```');
          lines.push(param.help);
          lines.push('```');
          lines.push('');
        }

        if (param.deprecated) {
          lines.push('> ⚠️ **DEPRECATED**');
          if (param.deprecationMessage) {
            lines.push(`> ${param.deprecationMessage}`);
          }
          lines.push('');
        }

        lines.push('---');
        lines.push('');
      });
    });

    return lines.join('\n');
  }
}
