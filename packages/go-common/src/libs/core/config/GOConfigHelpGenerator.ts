/**
 * Configuration Help Generator
 *
 * Generates formatted help text from configuration parameters.
 */

import { GOConfigParameter } from './GOConfigParameter.js';

/**
 * Options for help generation
 */
export interface GOConfigHelpGeneratorOptions {
  /** Program name */
  programName?: string | undefined;

  /** Program version */
  version?: string | undefined;

  /** Program description */
  description?: string | undefined;

  /** Usage examples */
  usage?: string[] | undefined;

  /** Column width for parameter names (default: 35) */
  columnWidth?: number | undefined;

  /** Include deprecated parameters (default: false) */
  includeDeprecated?: boolean | undefined;

  /** Show program infos header (default: false) */
  showProgramInfos?: boolean | undefined;

  /** Show default values (default: true) */
  showDefaults?: boolean | undefined;

  /** Show environment variable names (default: true) */
  showEnvVars?: boolean | undefined;

  /** Custom header */
  header?: string | undefined;

  /** Custom footer */
  footer?: string | undefined;
}

/**
 * Internal options type with required non-undefined properties
 */
interface GOConfigHelpGeneratorInternalOptions {
  programName: string;
  version: string;
  description: string;
  usage: string[];
  columnWidth: number;
  includeDeprecated: boolean;
  showProgramInfos: boolean;
  showDefaults: boolean;
  showEnvVars: boolean;
  header: string;
  footer: string;
}

/**
 * Generates formatted help text from configuration parameters
 */
export class GOConfigHelpGenerator {
  private readonly options: GOConfigHelpGeneratorInternalOptions;

  constructor(options: GOConfigHelpGeneratorOptions = {}) {
    this.options = {
      programName: options.programName ?? 'program',
      version: options.version ?? '1.0.0',
      description: options.description ?? '',
      usage: options.usage ?? [],
      columnWidth: options.columnWidth ?? 35,
      includeDeprecated: options.includeDeprecated ?? false,
      showProgramInfos: options.showProgramInfos ?? false,
      showDefaults: options.showDefaults !== false,
      showEnvVars: options.showEnvVars !== false,
      header: options.header ?? '',
      footer: options.footer ?? '',
    };
  }

  /**
   * Generate help text from parameters
   */
  generate(parameters: GOConfigParameter[]): string {
    const lines: string[] = [];

    // Header
    if (this.options.header) {
      lines.push(this.options.header);
      lines.push('');
    } else if (this.options.showProgramInfos) {
      lines.push(`${this.options.programName} v${this.options.version}`);
      if (this.options.description) {
        lines.push('');
        lines.push(this.options.description);
      }
      lines.push('');
    }

    // Usage
    if (this.options.usage && this.options.usage.length > 0) {
      lines.push('Usage:');
      this.options.usage.forEach((usage) => {
        lines.push(`  ${usage}`);
      });
      lines.push('');
    }

    // Group parameters by group
    const grouped = this.groupParameters(parameters);

    // Generate help for each group
    Object.entries(grouped).forEach(([groupName, params]) => {
      lines.push(groupName);
      lines.push('');

      params.forEach((param) => {
        lines.push(...this.generateParameterHelp(param));
      });

      lines.push('');
    });

    // Footer
    if (this.options.footer) {
      lines.push(this.options.footer);
    }

    return lines.join('\n');
  }

  /**
   * Generate compact help (only parameter names and abstracts)
   */
  generateCompact(parameters: GOConfigParameter[]): string {
    const lines: string[] = [];

    // Group parameters
    const grouped = this.groupParameters(parameters);

    // Generate compact help for each group
    Object.entries(grouped).forEach(([groupName, params]) => {
      lines.push(groupName);
      lines.push('');

      params.forEach((param) => {
        const usage = this.padRight(param.getCliUsage(), this.options.columnWidth);
        const abstract = param.abstract ?? '';
        lines.push(`  ${usage}${abstract}`);
      });

      lines.push('');
    });

    return lines.join('\n');
  }

  /**
   * Generate detailed help for a single parameter
   */
  generateParameterDetail(parameter: GOConfigParameter): string {
    const lines: string[] = [];

    lines.push(`Parameter: ${parameter.displayName}`);
    lines.push(`  Key: ${parameter.name}`);
    lines.push(`  Type: ${parameter.type}`);
    lines.push(`  CLI: ${parameter.cliFlag}`);

    if (parameter.aliases.length > 0) {
      lines.push(`  Aliases: ${parameter.aliases.join(', ')}`);
    }

    if (this.options.showEnvVars) {
      lines.push(`  Environment: ${parameter.envVar}`);
    }

    if (parameter.required) {
      lines.push(`  Required: yes`);
    }

    if (parameter.defaultValue !== undefined && this.options.showDefaults) {
      lines.push(`  Default: ${this.formatValue(parameter.defaultValue)}`);
    }

    if (parameter.abstract) {
      lines.push('');
      lines.push(`  ${parameter.abstract}`);
    }

    if (parameter.description) {
      lines.push('');
      lines.push('Description:');
      this.wrapText(parameter.description, 80).forEach((line) => {
        lines.push(`  ${line}`);
      });
    }

    if (parameter.help) {
      lines.push('');
      lines.push('Help:');
      this.wrapText(parameter.help, 80).forEach((line) => {
        lines.push(`  ${line}`);
      });
    }

    if (parameter.deprecated) {
      lines.push('');
      lines.push('⚠️  DEPRECATED');
      if (parameter.deprecationMessage) {
        lines.push(`  ${parameter.deprecationMessage}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate help for a single parameter (for list view)
   */
  private generateParameterHelp(parameter: GOConfigParameter): string[] {
    const lines: string[] = [];

    // Skip deprecated if not included
    if (parameter.deprecated && !this.options.includeDeprecated) {
      return lines;
    }

    // Build parameter line
    const usage = this.padRight(parameter.getCliUsage(), this.options.columnWidth);
    let abstract = parameter.abstract ?? '';

    // Add required indicator
    if (parameter.required) {
      abstract = `(required) ${abstract}`;
    }

    // Add default value
    if (parameter.defaultValue !== undefined && this.options.showDefaults) {
      abstract = `${abstract} [default: ${this.formatValue(parameter.defaultValue)}]`;
    }

    // Add deprecated indicator
    if (parameter.deprecated) {
      abstract = `⚠️  DEPRECATED ${abstract}`;
    }

    lines.push(`  ${usage}${abstract}`);

    // Add environment variable hint
    if (this.options.showEnvVars && parameter.envVar) {
      const envHint = this.padRight('', this.options.columnWidth);
      lines.push(`  ${envHint}env: ${parameter.envVar}`);
    }

    // Add aliases
    if (parameter.aliases.length > 0) {
      const aliasHint = this.padRight('', this.options.columnWidth);
      lines.push(`  ${aliasHint}aliases: ${parameter.aliases.join(', ')}`);
    }

    return lines;
  }

  /**
   * Group parameters by group name
   */
  private groupParameters(parameters: GOConfigParameter[]): Record<string, GOConfigParameter[]> {
    const grouped: Record<string, GOConfigParameter[]> = {};

    parameters.forEach((param) => {
      const groupName = param.group || 'General';
      if (!grouped[groupName]) {
        grouped[groupName] = [];
      }
      grouped[groupName].push(param);
    });

    // Sort parameters within each group by name
    Object.values(grouped).forEach((params) => {
      params.sort((a, b) => a.name.localeCompare(b.name));
    });

    return grouped;
  }

  /**
   * Pad string to the right with spaces
   */
  private padRight(str: string, width: number): string {
    if (str.length >= width) {
      return `${str} `;
    }
    return str + ' '.repeat(width - str.length);
  }

  /**
   * Format value for display
   */
  private formatValue(value: unknown): string {
    if (Array.isArray(value)) {
      return value.join(',');
    }
    if (typeof value === 'string') {
      return `"${value}"`;
    }
    return String(value);
  }

  /**
   * Wrap text to specified width
   */
  private wrapText(text: string, width: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    words.forEach((word) => {
      if (currentLine.length + word.length + 1 <= width) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  /**
   * Generate usage string for a parameter
   */
  generateUsageString(parameters: GOConfigParameter[]): string {
    const required = parameters.filter((p) => p.required);
    const optional = parameters.filter((p) => !p.required);

    const parts: string[] = [this.options.programName];

    // Add required parameters
    required.forEach((param) => {
      parts.push(param.getCliUsage());
    });

    // Add optional indicator
    if (optional.length > 0) {
      parts.push('[options]');
    }

    return parts.join(' ');
  }
}
