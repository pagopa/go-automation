/**
 * YAML Parser
 *
 * Parses YAML files into JavaScript objects.
 * Supports all standard YAML features.
 */

import * as fs from 'fs';
import * as YAML from 'yaml';

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
  static parseFile(filePath: string, encoding: BufferEncoding = 'utf8'): any {
    try {
      const content = fs.readFileSync(filePath, encoding);
      return this.parseContent(content);
    } catch (error: any) {
      throw new Error(`Failed to parse YAML file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Parse YAML content
   * @param content - YAML content as string
   * @returns Parsed YAML content as object
   */
  static parseContent(content: string): any {
    try {
      return YAML.parse(content);
    } catch (error: any) {
      throw new Error(`Failed to parse YAML content: ${error.message}`);
    }
  }

  /**
   * Parse multiple YAML files and merge them
   * Later files override earlier ones
   * @param filePaths - Array of YAML file paths
   * @param encoding - File encoding (default: 'utf8')
   * @returns Merged YAML content
   */
  static parseFiles(filePaths: string[], encoding: BufferEncoding = 'utf8'): any {
    const result: any = {};

    filePaths.forEach(filePath => {
      const content = this.parseFile(filePath, encoding);
      this.deepMerge(result, content);
    });

    return result;
  }

  /**
   * Deep merge two objects
   * @param target - Target object
   * @param source - Source object
   */
  private static deepMerge(target: any, source: any): void {
    if (!source) return;

    Object.keys(source).forEach(key => {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        sourceValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue) &&
        targetValue !== null
      ) {
        // Recursively merge nested objects
        this.deepMerge(targetValue, sourceValue);
      } else {
        // Overwrite with source value
        target[key] = sourceValue;
      }
    });
  }

  /**
   * Stringify JavaScript object to YAML
   * @param data - JavaScript object
   * @param options - YAML stringify options
   * @returns YAML string
   */
  static stringify(data: any, options?: YAML.ToStringOptions): string {
    try {
      return YAML.stringify(data, options);
    } catch (error: any) {
      throw new Error(`Failed to stringify to YAML: ${error.message}`);
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
    data: any,
    options?: YAML.ToStringOptions,
    encoding: BufferEncoding = 'utf8'
  ): void {
    try {
      const yamlContent = this.stringify(data, options);
      fs.writeFileSync(filePath, yamlContent, encoding);
    } catch (error: any) {
      throw new Error(`Failed to write YAML file ${filePath}: ${error.message}`);
    }
  }
}
