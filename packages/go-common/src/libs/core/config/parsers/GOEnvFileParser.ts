/**
 * Environment File Parser
 *
 * Parses .env style files into key-value pairs.
 * Supports:
 * - KEY=value
 * - KEY="value with spaces"
 * - KEY='value with spaces'
 * - Comments (#)
 * - Empty lines
 * - Variable expansion ${VAR}
 */

import * as fs from 'fs';
import { getErrorMessage } from '../../errors/GOErrorUtils.js';

/**
 * Parses .env style environment files
 */
export class GOEnvFileParser {
  /**
   * Parse an environment file
   * @param filePath - Path to .env file
   * @param encoding - File encoding (default: 'utf8')
   * @returns Map of environment variable name to value
   */
  static parseFile(filePath: string, encoding: BufferEncoding = 'utf8'): Map<string, string> {
    try {
      const content = fs.readFileSync(filePath, encoding);
      return this.parseContent(content);
    } catch (error: unknown) {
      throw new Error(`Failed to parse env file ${filePath}: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Parse environment file content
   * @param content - File content as string
   * @param existingVars - Existing variables for expansion (default: process.env)
   * @returns Map of environment variable name to value
   */
  static parseContent(
    content: string,
    existingVars: Record<string, string | undefined> = process.env,
  ): Map<string, string> {
    const result = new Map<string, string>();
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const lineValue = lines[i];
      if (!lineValue) continue;
      const line = lineValue.trim();

      // Skip empty lines and comments
      if (!line || line.startsWith('#')) {
        continue;
      }

      // Find the first '=' to split key and value
      const equalsIndex = line.indexOf('=');
      if (equalsIndex === -1) {
        // Line without '=' - skip or warn
        continue;
      }

      const key = line.substring(0, equalsIndex).trim();
      let value = line.substring(equalsIndex + 1).trim();

      // Validate key (must be valid env var name)
      if (!this.isValidEnvKey(key)) {
        throw new Error(`Invalid environment variable name at line ${i + 1}: "${key}"`);
      }

      // Parse value (handle quotes and escapes)
      value = this.parseValue(value);

      // Expand variables
      value = this.expandVariables(value, result, existingVars);

      result.set(key, value);
    }

    return result;
  }

  /**
   * Check if a key is a valid environment variable name
   */
  private static isValidEnvKey(key: string): boolean {
    // Environment variable names should contain only letters, numbers, and underscores
    // and should not start with a number
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
  }

  /**
   * Parse a value, handling quotes and escapes
   */
  private static parseValue(value: string): string {
    // Handle double quotes
    if (value.startsWith('"') && value.endsWith('"')) {
      return this.unescapeDoubleQuoted(value.slice(1, -1));
    }

    // Handle single quotes (no escape processing)
    if (value.startsWith("'") && value.endsWith("'")) {
      return value.slice(1, -1);
    }

    // Handle backticks (no escape processing)
    if (value.startsWith('`') && value.endsWith('`')) {
      return value.slice(1, -1);
    }

    // Unquoted value - remove inline comments
    const commentIndex = value.indexOf('#');
    if (commentIndex !== -1) {
      value = value.substring(0, commentIndex).trim();
    }

    return value;
  }

  /**
   * Unescape double-quoted string
   */
  private static unescapeDoubleQuoted(str: string): string {
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\')
      .replace(/\\"/g, '"');
  }

  /**
   * Expand variables in value
   * Supports: ${VAR}, $VAR
   */
  private static expandVariables(
    value: string,
    currentVars: Map<string, string>,
    existingVars: Record<string, string | undefined>,
  ): string {
    // Expand ${VAR} syntax
    value = value.replace(/\$\{([A-Za-z0-9_]+)\}/g, (_match: string, varName: string): string => {
      // Check current vars first, then existing vars
      return currentVars.get(varName) ?? existingVars[varName] ?? '';
    });

    // Expand $VAR syntax (but not ${ or escaped \$)
    value = value.replace(
      /(?<!\\)\$([A-Za-z_][A-Za-z0-9_]*)/g,
      (_match: string, varName: string): string => {
        return currentVars.get(varName) ?? existingVars[varName] ?? '';
      },
    );

    // Remove escaped dollar signs
    value = value.replace(/\\\$/g, '$');

    return value;
  }

  /**
   * Parse multiple .env files in order
   * Later files override earlier ones
   */
  static parseFiles(filePaths: string[], encoding: BufferEncoding = 'utf8'): Map<string, string> {
    const result = new Map<string, string>();

    filePaths.forEach((filePath) => {
      const vars = this.parseFile(filePath, encoding);
      vars.forEach((value, key) => {
        result.set(key, value);
      });
    });

    return result;
  }
}
