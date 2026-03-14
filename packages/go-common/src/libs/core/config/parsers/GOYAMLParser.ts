/**
 * YAML Parser
 *
 * Parses YAML files into JavaScript objects.
 * Supports all standard YAML features.
 */

import * as fs from 'fs';
import * as YAML from 'yaml';
import { getErrorMessage } from '../../errors/GOErrorUtils.js';

/**
 * Represents a YAML value which can be a primitive, array, or nested object.
 * Used for type-safe handling of parsed YAML content.
 */
export type YAMLValue = string | number | boolean | null | undefined | YAMLValue[] | { [key: string]: YAMLValue };

/**
 * Type guard to check if a value is a YAML object (non-array, non-null object).
 * Useful for narrowing YAMLValue to Record<string, YAMLValue>.
 *
 * @param value - The value to check
 * @returns True if the value is a YAML object
 *
 * @example
 * ```typescript
 * const data = GOYAMLParser.parseFile('config.yaml');
 * if (isYAMLObject(data)) {
 *   // data is now Record<string, YAMLValue>
 *   console.log(data['key']);
 * }
 * ```
 */
export function isYAMLObject(value: unknown): value is Record<string, YAMLValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses YAML files
 */
export class GOYAMLParser {
  /**
   * Parse a YAML file
   * @param filePath - Path to YAML file
   * @param encoding - File encoding (default: 'utf8')
   * @returns Parsed YAML content as object
   */
  static parseFile(filePath: string, encoding: BufferEncoding = 'utf8'): YAMLValue {
    try {
      const content = fs.readFileSync(filePath, encoding);
      return this.parseContent(content);
    } catch (error: unknown) {
      throw new Error(`Failed to parse YAML file ${filePath}: ${getErrorMessage(error)}`, { cause: error });
    }
  }

  /**
   * Parse YAML content
   * @param content - YAML content as string
   * @returns Parsed YAML content as object
   */
  static parseContent(content: string): YAMLValue {
    try {
      return YAML.parse(content) as YAMLValue;
    } catch (error: unknown) {
      throw new Error(`Failed to parse YAML content: ${getErrorMessage(error)}`, { cause: error });
    }
  }

  /**
   * Parse multiple YAML files and merge them
   * Later files override earlier ones
   * @param filePaths - Array of YAML file paths
   * @param encoding - File encoding (default: 'utf8')
   * @returns Merged YAML content
   */
  static parseFiles(filePaths: ReadonlyArray<string>, encoding: BufferEncoding = 'utf8'): Record<string, YAMLValue> {
    const result: Record<string, YAMLValue> = {};

    for (const filePath of filePaths) {
      const content = this.parseFile(filePath, encoding);
      if (isYAMLObject(content)) {
        this.deepMerge(result, content);
      }
    }

    return result;
  }

  /**
   * Deep merge two objects
   * @param target - Target object
   * @param source - Source object
   */
  private static deepMerge(target: Record<string, YAMLValue>, source: Record<string, YAMLValue>): void {
    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (isYAMLObject(sourceValue) && isYAMLObject(targetValue)) {
        // Recursively merge nested objects
        this.deepMerge(targetValue, sourceValue);
      } else {
        // Overwrite with source value
        target[key] = sourceValue;
      }
    }
  }

  /**
   * Stringify JavaScript object to YAML
   * @param data - JavaScript object
   * @param options - YAML stringify options
   * @returns YAML string
   */
  static stringify(data: YAMLValue, options?: YAML.ToStringOptions): string {
    try {
      return YAML.stringify(data, options);
    } catch (error: unknown) {
      throw new Error(`Failed to stringify to YAML: ${getErrorMessage(error)}`, { cause: error });
    }
  }

  /**
   * Write JavaScript object to YAML file
   * @param filePath - Path to YAML file
   * @param data - JavaScript object
   * @param options - YAML stringify options
   * @param encoding - File encoding (default: 'utf8')
   */
  static writeFile(
    filePath: string,
    data: YAMLValue,
    options?: YAML.ToStringOptions,
    encoding: BufferEncoding = 'utf8',
  ): void {
    try {
      const yamlContent = this.stringify(data, options);
      fs.writeFileSync(filePath, yamlContent, encoding);
    } catch (error: unknown) {
      throw new Error(`Failed to write YAML file ${filePath}: ${getErrorMessage(error)}`, { cause: error });
    }
  }
}
