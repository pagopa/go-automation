/**
 * GOStringUtils - String manipulation utilities
 * Provides smart truncation for paths and regular strings
 */

/**
 * Smart truncation options
 */
export interface GOSmartTruncateOptions {
  /** Maximum length before truncation */
  readonly maxLength: number;
  /** Ellipsis character (default: '…') */
  readonly ellipsis?: string;
  /** Force path-style truncation (from start) even if not detected as path */
  readonly forcePathStyle?: boolean;
}

// Pre-compiled regex patterns for path detection (performance optimization)
const WINDOWS_ABSOLUTE_PATH = /^[a-zA-Z]:\\/;
const RELATIVE_PATH = /^\.\.?\//;
const UNIX_ABSOLUTE_PATH = /^\//;
const FILE_EXTENSION = /\.[a-z0-9]{1,4}$/i;

const PATH_PATTERNS: ReadonlyArray<RegExp> = [
  WINDOWS_ABSOLUTE_PATH,
  RELATIVE_PATH,
  UNIX_ABSOLUTE_PATH,
  FILE_EXTENSION,
] as const;

/**
 * Checks if a string looks like a file path
 * Detects both Unix-style (/) and Windows-style (\) paths
 *
 * @param value - String to check
 * @returns true if the string appears to be a path
 */
export function isPath(value: string): boolean {
  // Check for path separators
  const hasPathSeparator = value.includes('/') || value.includes('\\');

  // Check for common path patterns
  const matchesPattern = PATH_PATTERNS.some((pattern) => pattern.test(value));

  return hasPathSeparator || matchesPattern;
}

/**
 * Truncates a string intelligently:
 * - For paths: truncates from the START, keeping the end (most relevant part)
 * - For regular strings: truncates from the END, keeping the start
 *
 * Complexity: O(n) where n is the string length (due to slice operations)
 *
 * @param value - String to truncate
 * @param options - Truncation options
 * @returns Truncated string with ellipsis if needed
 *
 * @example
 * ```typescript
 * // Path truncation (from start)
 * smartTruncate('/Users/massimo/Projects/go-automation/config.yaml', { maxLength: 30 })
 * // Returns: '…/go-automation/config.yaml'
 *
 * // Regular string truncation (from end)
 * smartTruncate('This is a very long description', { maxLength: 20 })
 * // Returns: 'This is a very lo…'
 * ```
 */
export function smartTruncate(value: string, options: GOSmartTruncateOptions): string {
  const { maxLength, ellipsis = '…', forcePathStyle = false } = options;

  // Early return for empty strings
  if (!value) {
    return '';
  }

  // Edge case: maxLength <= 0
  if (maxLength <= 0) {
    return '';
  }

  // No truncation needed
  if (value.length <= maxLength) {
    return value;
  }

  // Edge case: maxLength <= ellipsis length - return truncated ellipsis
  if (maxLength <= ellipsis.length) {
    return ellipsis.slice(0, maxLength);
  }

  // Determine truncation style
  const shouldTruncateFromStart = forcePathStyle || isPath(value);

  if (shouldTruncateFromStart) {
    // Path-style: truncate from START, keep END
    // Example: "/very/long/path/to/file.txt" -> "…/to/file.txt"
    const keepLength = maxLength - ellipsis.length;
    const truncated = value.slice(-keepLength);
    return `${ellipsis}${truncated}`;
  } else {
    // Regular: truncate from END, keep START
    // Example: "Very long description text" -> "Very long desc…"
    const keepLength = maxLength - ellipsis.length;
    const truncated = value.slice(0, keepLength);
    return `${truncated}${ellipsis}`;
  }
}

/**
 * Truncates a path from the start, keeping the most relevant part (filename/end)
 * Convenience wrapper for smartTruncate with forcePathStyle=true
 *
 * @param path - Path to truncate
 * @param maxLength - Maximum length
 * @param ellipsis - Ellipsis character (default: '…')
 * @returns Truncated path
 */
export function truncatePath(path: string, maxLength: number, ellipsis: string = '…'): string {
  return smartTruncate(path, { maxLength, ellipsis, forcePathStyle: true });
}

/**
 * Truncates a regular string from the end, keeping the start
 * Convenience wrapper for smartTruncate with forcePathStyle=false
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @param ellipsis - Ellipsis character (default: '…')
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number, ellipsis: string = '…'): string {
  return smartTruncate(text, { maxLength, ellipsis, forcePathStyle: false });
}
