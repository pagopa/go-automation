/**
 * Command Line Argument Parser
 *
 * Parses command line arguments into configuration key-value pairs.
 * Supports:
 * - --key value (separate arguments)
 * - --key=value (equals sign; only the first `=` separates, so `--k=a=b` gives `a=b`)
 * - --flag (boolean flag, treated as true)
 * - --key val1 val2 (arrays with space-separated values)
 * - --key val1 --key val2 (arrays with repeated flags)
 * - --key val1,val2 (comma-separated lists)
 *
 * A single value is kept verbatim, commas included, so a string parameter
 * receives exactly what was typed; array parameters split it on commas when
 * the value is converted (`GOConfigTypeConverter.toStringArray`). Only when a
 * flag collects several values (repeated flag or space-separated values) is
 * every item split on commas here, because the result is already a list.
 */

/**
 * Parses command line arguments
 */
export class GOCLIArgumentParser {
  /**
   * Parse command line arguments
   * @param args - Array of arguments (e.g., process.argv.slice(2))
   * @returns Map of flag names to values
   */
  static parse(args: string[]): Map<string, string | string[]> {
    const result = new Map<string, string | string[]>();
    let i = 0;

    while (i < args.length) {
      const arg = args[i];
      if (!arg) {
        i++;
        continue;
      }

      // Check if this is a flag (starts with -- or -)
      if (arg.startsWith('--') || arg.startsWith('-')) {
        const parsed = this.parseFlag(args, i);

        if (!parsed) {
          i++;
          continue;
        }

        const { key, value, consumed } = parsed;
        this.mergeValue(result, key, value);
        i += consumed;
      } else {
        // Non-flag argument - skip
        i++;
      }
    }

    return result;
  }

  /**
   * Parse a single flag and its value(s)
   * @returns Parsed result with key, value, and number of arguments consumed
   */
  private static parseFlag(
    args: string[],
    index: number,
  ): { key: string; value: string | string[]; consumed: number } | null {
    const arg = args[index];
    if (!arg) return null;

    const split = this.splitFlag(arg);
    if (!split) return null;
    const { key, inlineValue } = split;

    // If there's an inline value, use it verbatim
    if (inlineValue !== undefined) {
      return { key, value: inlineValue, consumed: 1 };
    }

    // Check if next argument is a value (not a flag)
    const nextArg = args[index + 1];

    if (!nextArg || nextArg.startsWith('-')) {
      // Boolean flag (no value)
      return {
        key,
        value: 'true',
        consumed: 1,
      };
    }

    // Collect all non-flag values
    const values: string[] = [];
    let consumed = 1;

    for (let j = index + 1; j < args.length; j++) {
      const currentArg = args[j];
      if (!currentArg) continue;

      // Stop if we hit another flag
      if (currentArg.startsWith('-')) {
        break;
      }

      values.push(currentArg);
      consumed++;
    }

    // If we collected multiple values, return as a list
    if (values.length > 1) {
      return { key, value: this.toList(values), consumed };
    }

    // Single value
    const firstValue = values[0];
    if (!firstValue) {
      // No value - treat as boolean flag
      return {
        key,
        value: 'true',
        consumed: 1,
      };
    }

    return { key, value: firstValue, consumed };
  }

  /**
   * Splits a flag argument into its name (without leading dashes) and inline value.
   * Only the first `=` separates name and value: `--defaults=a=b` gives `a=b`.
   *
   * @param arg - Flag argument, e.g. `--key`, `--key=value`, `-k=value`
   * @returns Name and optional inline value, or null when the name is empty
   */
  private static splitFlag(arg: string): { key: string; inlineValue?: string } | null {
    const separator = arg.indexOf('=');
    const name = separator < 0 ? arg : arg.slice(0, separator);
    if (!name) return null;
    const key = name.replace(/^--?/, '');
    return separator < 0 ? { key } : { key, inlineValue: arg.slice(separator + 1) };
  }

  /**
   * Turns the values collected for one flag into a list, splitting every item on commas.
   *
   * @param values - Values collected for the flag
   * @returns Trimmed, non-empty items
   */
  private static toList(values: ReadonlyArray<string>): string[] {
    return values.flatMap((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    );
  }

  /**
   * Parse arguments with custom format
   * Allows specifying which flags expect values vs which are boolean
   */
  static parseWithSchema(
    args: string[],
    schema: {
      booleanFlags?: string[];
      arrayFlags?: string[];
    },
  ): Map<string, string | string[]> {
    const booleanFlags = new Set(schema.booleanFlags ?? []);
    const result = new Map<string, string | string[]>();

    let i = 0;
    while (i < args.length) {
      const arg = args[i];
      if (!arg) {
        i++;
        continue;
      }

      if (!arg.startsWith('--') && !arg.startsWith('-')) {
        i++;
        continue;
      }

      const split = this.splitFlag(arg);
      if (!split) {
        i++;
        continue;
      }
      const flagName = split.key;
      const inlineValue = split.inlineValue;

      // Check if this is a boolean flag
      if (booleanFlags.has(flagName)) {
        result.set(flagName, inlineValue ?? 'true');
        i++;
        continue;
      }

      // Handle inline value
      if (inlineValue !== undefined) {
        this.mergeValue(result, flagName, inlineValue);
        i++;
        continue;
      }

      // Collect value(s)
      const values: string[] = [];
      let j = i + 1;

      while (j < args.length) {
        const nextArg = args[j];
        if (!nextArg || nextArg.startsWith('-')) break;
        values.push(nextArg);
        j++;
      }

      if (values.length === 0) {
        // No value provided - treat as boolean
        result.set(flagName, 'true');
      } else if (values.length === 1) {
        const firstVal = values[0];
        if (firstVal) {
          this.mergeValue(result, flagName, firstVal);
        }
      } else {
        this.mergeValue(result, flagName, this.toList(values));
      }

      i = j;
    }

    return result;
  }

  /**
   * Merges a value into the result map. A repeated flag turns the value into a
   * list, so the verbatim single values merged here are split on commas.
   */
  private static mergeValue(result: Map<string, string | string[]>, key: string, value: string | string[]): void {
    const existing = result.get(key);

    if (existing === undefined) {
      result.set(key, value);
      return;
    }

    const existingList = Array.isArray(existing) ? existing : this.toList([existing]);
    const newList = Array.isArray(value) ? value : this.toList([value]);
    result.set(key, [...existingList, ...newList]);
  }
}
