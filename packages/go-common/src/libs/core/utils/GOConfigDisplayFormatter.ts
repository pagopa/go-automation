/**
 * GOConfigDisplayFormatter - Formatters for configuration display in tables
 * Handles smart formatting of config values and sources for optimal readability
 */

import { smartTruncate } from './GOStringUtils.js';

/**
 * Pattern for structured source formats: TYPE(path)
 * Matches: YAML(/path), JSON(/path), Environment(/path), etc.
 */
const SOURCE_PATTERN = /^([A-Z][A-Za-z]*)\((.+)\)$/;

/**
 * Formatted configuration display result
 */
export interface FormattedConfigDisplay {
  readonly value: string;
  readonly source: string;
}

/**
 * Formats a configuration source for display in tables
 * Preserves the source type (YAML, JSON, Environment) and smartly truncates the path
 *
 * Pattern handled: TYPE(path) → TYPE(…truncated/path)
 *
 * @param source - Source string from ConfigProvider (e.g., "YAML(/path/to/config.yaml)")
 * @param maxLength - Maximum length for the entire output
 * @returns Formatted source with type preserved and path truncated
 *
 * @example
 * ```typescript
 * formatConfigSourceDisplay('YAML(/Users/user/project/configs/config.yaml)', 50)
 * // Returns: 'YAML(…project/configs/config.yaml)'
 *
 * formatConfigSourceDisplay('CommandLine', 50)
 * // Returns: 'CommandLine' (no truncation needed)
 *
 * formatConfigSourceDisplay('Environment(/very/long/path/.env)', 30)
 * // Returns: 'Environment(…/path/.env)'
 * ```
 */
export function formatConfigSourceDisplay(source: string, maxLength: number): string {
  if (!source) {
    return '';
  }

  // Early return if no truncation needed
  if (source.length <= maxLength) {
    return source;
  }

  // Check if source matches TYPE(path) pattern
  const match = SOURCE_PATTERN.exec(source);

  if (!match) {
    // No pattern match - truncate normally (e.g., "CommandLine", "NONE")
    return smartTruncate(source, { maxLength });
  }

  // Extract type and path from pattern
  const type = match[1];
  const path = match[2];

  // Type guard: ensure both type and path are defined
  // (This should always be true if regex matched, but satisfies strict TypeScript)
  if (!type || !path) {
    return smartTruncate(source, { maxLength });
  }

  // Calculate available space for path
  // Format is: TYPE(path) = type.length + 2 (for parentheses)
  const typeOverhead = type.length + 2;
  const availableForPath = maxLength - typeOverhead;

  // Minimum useful path length: ellipsis (1 char) + at least 1 content char
  const minUsefulPathLength = 2;

  // If there's not enough space for a useful truncated path, truncate everything
  if (availableForPath < minUsefulPathLength) {
    return smartTruncate(source, { maxLength });
  }

  // Truncate only the path part, preserving the type
  const truncatedPath = smartTruncate(path, {
    maxLength: availableForPath,
    forcePathStyle: true  // Always treat as path
  });

  return `${type}(${truncatedPath})`;
}

/**
 * Formats a configuration value for display in tables
 * Removes outer quotes (double or single) commonly from JSON serialization or manual input
 *
 * Note: JSON.stringify uses double quotes; single quote support is for compatibility
 * with manual configuration input or other serialization formats
 *
 * Complexity: O(n) where n is the string length
 *
 * @param value - Value string (potentially JSON.stringify'd)
 * @param maxLength - Maximum length for output
 * @returns Formatted value without quotes and properly truncated
 *
 * @example
 * ```typescript
 * formatConfigValueDisplay('"api.uat.notifichedigitali.it"', 50)
 * // Returns: 'api.uat.notifichedigitali.it'
 *
 * formatConfigValueDisplay('"../../../data/send-import/file.csv"', 30)
 * // Returns: '…/send-import/file.csv'
 *
 * formatConfigValueDisplay('true', 50)
 * // Returns: 'true' (no quotes to remove)
 *
 * formatConfigValueDisplay('42', 50)
 * // Returns: '42'
 * ```
 */
export function formatConfigValueDisplay(value: string, maxLength: number): string {
  if (!value) {
    return '';
  }

  let cleanValue = value;

  // Remove outer quotes if present (double or single)
  // JSON.stringify uses double quotes; single quotes for compatibility
  if ((cleanValue.startsWith('"') && cleanValue.endsWith('"')) ||
    (cleanValue.startsWith("'") && cleanValue.endsWith("'"))) {
    cleanValue = cleanValue.slice(1, -1);
  }

  // Apply smart truncation
  return smartTruncate(cleanValue, { maxLength });
}

/**
 * Formats both value and source for configuration display
 * Convenience function that applies both formatters
 *
 * @param value - Configuration value
 * @param source - Configuration source
 * @param maxValueLength - Maximum length for value
 * @param maxSourceLength - Maximum length for source
 * @returns Object with formatted value and source
 *
 * @example
 * ```typescript
 * const formatted = formatConfigDisplay(
 *   '"../data/file.csv"',
 *   'YAML(/Users/user/configs/config.yaml)',
 *   50,
 *   50
 * );
 * // Returns: {
 * //   value: '…/data/file.csv',
 * //   source: 'YAML(…/configs/config.yaml)'
 * // }
 * ```
 */
export function formatConfigDisplay(
  value: string,
  source: string,
  maxValueLength: number,
  maxSourceLength: number
): FormattedConfigDisplay {
  return {
    value: formatConfigValueDisplay(value, maxValueLength),
    source: formatConfigSourceDisplay(source, maxSourceLength),
  };
}
