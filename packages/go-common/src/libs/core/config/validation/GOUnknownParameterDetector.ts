/**
 * Unknown Parameter Detector
 *
 * Detects unrecognized CLI flags and provides "Did you mean?" suggestions
 * using Damerau-Levenshtein string distance.
 */

import type { GOConfigSchema } from '../GOConfigSchema.js';
import { damerauLevenshteinDistance } from './GOStringDistance.js';

/**
 * Suggestion for a closest matching valid parameter
 */
export interface ParameterSuggestion {
  /** The suggested valid flag (e.g., "--start-date") */
  readonly flag: string;
  /** The edit distance from the unknown flag */
  readonly distance: number;
}

/**
 * Error entry for a single unknown parameter
 */
export interface UnknownParameterError {
  /** The unknown flag as provided by the user (e.g., "strat-date") */
  readonly flag: string;
  /** The closest matching suggestion, if any */
  readonly suggestion?: ParameterSuggestion | undefined;
}

/**
 * Maximum edit distance to consider a flag as a valid suggestion.
 * Distance 3 covers most common typos while avoiding unrelated suggestions.
 */
const MAX_SUGGESTION_DISTANCE = 3;

/**
 * For very short flags (length <= this threshold), the maximum distance
 * is reduced to 1 to avoid false positive suggestions.
 */
const SHORT_FLAG_LENGTH_THRESHOLD = 3;

/**
 * Built-in flags that are always valid and should never be reported as unknown.
 */
const BUILTIN_FLAGS: ReadonlyArray<string> = ['help', 'h'];

/**
 * Detects unknown CLI parameters and generates "Did you mean?" suggestions.
 *
 * @example
 * ```typescript
 * const errors = GOUnknownParameterDetector.detect(
 *   ['strat-date', 'end-date', 'verbos'],
 *   configSchema,
 * );
 * if (errors.length > 0) {
 *   console.error(GOUnknownParameterDetector.formatErrorMessage(errors));
 * }
 * ```
 */
export class GOUnknownParameterDetector {
  /**
   * Detect unknown CLI flags by comparing provided flags against the schema.
   *
   * @param providedFlags - Flags provided by the user (without -- prefix)
   * @param schema - The configuration schema with registered parameters
   * @returns Array of unknown parameter errors (empty if all flags are valid)
   */
  static detect(providedFlags: ReadonlyArray<string>, schema: GOConfigSchema): ReadonlyArray<UnknownParameterError> {
    const validFlags = this.buildValidFlagsSet(schema);
    const errors: UnknownParameterError[] = [];
    const validFlagsList = Array.from(validFlags);

    for (const flag of providedFlags) {
      if (!validFlags.has(flag)) {
        const suggestion = this.findClosestFlag(flag, validFlagsList);
        errors.push({ flag, suggestion });
      }
    }

    return errors;
  }

  /**
   * Format unknown parameter errors into a user-friendly error message.
   *
   * @param errors - Array of unknown parameter errors
   * @returns Formatted error message string
   *
   * @example
   * Output:
   * ```
   * Unknown parameter(s):
   *
   *   --strat-date    Did you mean --start-date?
   *   --verbos        Did you mean --verbose?
   *
   * Run with --help to see all available parameters.
   * ```
   */
  static formatErrorMessage(errors: ReadonlyArray<UnknownParameterError>): string {
    const lines: string[] = [];

    lines.push('Unknown parameter(s):');
    lines.push('');

    for (const error of errors) {
      const flagDisplay = `  --${error.flag}`;
      if (error.suggestion) {
        lines.push(`${flagDisplay}    Did you mean ${error.suggestion.flag}?`);
      } else {
        lines.push(flagDisplay);
      }
    }

    lines.push('');
    lines.push('Run with --help to see all available parameters.');

    return lines.join('\n');
  }

  /**
   * Build a set of all valid CLI flag names (without prefix) from the schema.
   * Includes primary flags, aliases, and built-in flags (--help, -h).
   *
   * @param schema - The configuration schema
   * @returns Set of valid flag names without -- prefix
   */
  private static buildValidFlagsSet(schema: GOConfigSchema): Set<string> {
    const validFlags = new Set<string>();

    // Add built-in flags
    for (const flag of BUILTIN_FLAGS) {
      validFlags.add(flag);
    }

    // Add flags from all registered parameters
    for (const param of schema.getAllParameters()) {
      // Primary CLI flag (e.g., "--start-date" -> "start-date")
      const primaryFlag = param.cliFlag.replace(/^--?/, '');
      validFlags.add(primaryFlag);

      // Aliases (may or may not have prefix)
      for (const alias of param.aliases) {
        const bareAlias = alias.replace(/^--?/, '');
        validFlags.add(bareAlias);
      }
    }

    return validFlags;
  }

  /**
   * Find the closest matching valid flag for an unknown flag.
   * Uses Damerau-Levenshtein distance to rank candidates.
   *
   * For short flags (length <= 3), the maximum distance is reduced to 1
   * to avoid false positive suggestions.
   *
   * @param unknownFlag - The unrecognized flag name (without --)
   * @param validFlags - Array of valid flag names (without --)
   * @returns The best suggestion, or undefined if no close match exists
   */
  private static findClosestFlag(
    unknownFlag: string,
    validFlags: ReadonlyArray<string>,
  ): ParameterSuggestion | undefined {
    const maxDistance = unknownFlag.length <= SHORT_FLAG_LENGTH_THRESHOLD ? 1 : MAX_SUGGESTION_DISTANCE;

    let bestMatch: ParameterSuggestion | undefined;

    for (const validFlag of validFlags) {
      const distance = damerauLevenshteinDistance(unknownFlag, validFlag);

      if (distance <= maxDistance) {
        if (bestMatch === undefined || distance < bestMatch.distance) {
          bestMatch = { flag: `--${validFlag}`, distance };
        }
      }
    }

    return bestMatch;
  }
}
