/**
 * Configuration Type Converter
 *
 * Handles conversion of raw configuration values (strings) into typed values
 * (numbers, booleans, arrays, buffers, etc.)
 */

import { getErrorMessage } from '../errors/GOErrorUtils.js';

type GOConfigValueTransformer<T> = (value: string | string[]) => T;

/**
 * Converts raw configuration values to specific types
 */
export class GOConfigTypeConverter {
  /**
   * Convert to string
   * @param value - Raw value from provider
   * @returns String value (first element if array)
   */
  static toString(value: string | string[]): string {
    return Array.isArray(value) ? (value[0] ?? '') : value;
  }

  /**
   * Convert to integer
   * @param value - Raw value from provider
   * @returns Integer value
   * @throws Error if value cannot be converted to integer
   */
  static toInt(value: string | string[]): number {
    const str = this.toString(value).trim();
    const num = parseInt(str, 10);

    if (isNaN(num)) {
      throw new Error(`Cannot convert "${str}" to integer`);
    }

    return num;
  }

  /**
   * Convert to floating point number
   * @param value - Raw value from provider
   * @returns Double/float value
   * @throws Error if value cannot be converted to number
   */
  static toDouble(value: string | string[]): number {
    const str = this.toString(value).trim();
    const num = parseFloat(str);

    if (isNaN(num)) {
      throw new Error(`Cannot convert "${str}" to number`);
    }

    return num;
  }

  /**
   * Convert to boolean
   * Accepts various formats: true/false, 1/0, yes/no, on/off
   *
   * @param value - Raw value from provider
   * @returns Boolean value
   * @throws Error if value cannot be converted to boolean
   */
  static toBool(value: string | string[]): boolean {
    const str = this.toString(value).trim().toLowerCase();

    const truthyValues = ['true', '1', 'yes', 'on', 'enabled'];
    const falsyValues = ['false', '0', 'no', 'off', 'disabled', ''];

    if (truthyValues.includes(str)) {
      return true;
    }

    if (falsyValues.includes(str)) {
      return false;
    }

    throw new Error(`Cannot convert "${str}" to boolean. Use: true/false, 1/0, yes/no, on/off`);
  }

  /**
   * Convert to string array
   * Handles arrays, comma-separated values, and single values
   *
   * @param value - Raw value from provider
   * @param separator - Separator for splitting strings (default: ',')
   * @returns Array of strings
   */
  static toStringArray(value: string | string[], separator = ','): string[] {
    if (Array.isArray(value)) {
      return value;
    }

    // Handle comma-separated values
    if (value.includes(separator)) {
      return value
        .split(separator)
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
    }

    // Single value becomes single-element array
    return value ? [value] : [];
  }

  /**
   * Convert to integer array
   * @param value - Raw value from provider
   * @param separator - Separator for splitting strings (default: ',')
   * @returns Array of integers
   */
  static toIntArray(value: string | string[], separator = ','): number[] {
    return this.toStringArray(value, separator).map((v) => {
      const num = parseInt(v.trim(), 10);
      if (isNaN(num)) {
        throw new Error(`Cannot convert "${v}" to integer in array`);
      }
      return num;
    });
  }

  /**
   * Convert to double array
   * @param value - Raw value from provider
   * @param separator - Separator for splitting strings (default: ',')
   * @returns Array of numbers
   */
  static toDoubleArray(value: string | string[], separator = ','): number[] {
    return this.toStringArray(value, separator).map((v) => {
      const num = parseFloat(v.trim());
      if (isNaN(num)) {
        throw new Error(`Cannot convert "${v}" to number in array`);
      }
      return num;
    });
  }

  /**
   * Convert to boolean array
   * @param value - Raw value from provider
   * @param separator - Separator for splitting strings (default: ',')
   * @returns Array of booleans
   */
  static toBoolArray(value: string | string[], separator = ','): boolean[] {
    return this.toStringArray(value, separator).map((v) => this.toBool(v));
  }

  /**
   * Convert to Buffer (defaults to base64 encoding)
   * @param value - Raw value from provider
   * @param encoding - Buffer encoding (default: 'base64')
   * @returns Buffer
   */
  static toBuffer(value: string | string[], encoding: BufferEncoding = 'base64'): Buffer {
    const str = this.toString(value);
    try {
      return Buffer.from(str, encoding);
    } catch (error: unknown) {
      throw new Error(`Cannot convert "${str}" to Buffer with encoding ${encoding}: ${getErrorMessage(error)}`, {
        cause: error,
      });
    }
  }

  /**
   * Convert to array of Buffers
   * @param value - Raw value from provider
   * @param separator - Separator for splitting strings (default: ',')
   * @param encoding - Buffer encoding (default: 'base64')
   * @returns Array of Buffers
   */
  static toBufferArray(value: string | string[], separator = ',', encoding: BufferEncoding = 'base64'): Buffer[] {
    return this.toStringArray(value, separator).map((v) => {
      try {
        return Buffer.from(v, encoding);
      } catch (error: unknown) {
        throw new Error(`Cannot convert "${v}" to Buffer with encoding ${encoding}: ${getErrorMessage(error)}`, {
          cause: error,
        });
      }
    });
  }

  /**
   * Try to convert value, return default if conversion fails
   * @param converter - Conversion function
   * @param value - Raw value
   * @param defaultValue - Default value to return on error
   * @returns Converted value or default
   */
  static tryConvert<T>(
    converter: GOConfigValueTransformer<T>,
    value: string | string[] | undefined,
    defaultValue: T,
  ): T {
    if (value === undefined) {
      return defaultValue;
    }

    try {
      return converter(value);
    } catch {
      return defaultValue;
    }
  }
}
