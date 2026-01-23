/**
 * Command Line Argument Parser
 *
 * Parses command line arguments into configuration key-value pairs.
 * Supports:
 * - --key value (separate arguments)
 * - --key=value (equals sign)
 * - --flag (boolean flag, treated as true)
 * - --key val1 val2 (arrays with space-separated values)
 * - --key val1 --key val2 (arrays with repeated flags)
 * - --key val1,val2 (arrays with comma-separated values)
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

        // Handle multiple values for the same key (accumulate into array)
        const existing = result.get(key);
        if (existing !== undefined) {
          // Merge values
          const existingArray = Array.isArray(existing) ? existing : [existing];
          const newArray = Array.isArray(value) ? value : [value];
          result.set(key, [...existingArray, ...newArray]);
        } else {
          result.set(key, value);
        }

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
    index: number
  ): { key: string; value: string | string[]; consumed: number } | null {
    const arg = args[index];
    if (!arg) return null;

    // Extract flag name
    let flagName: string;
    let inlineValue: string | undefined;

    if (arg.includes('=')) {
      // Format: --key=value
      const parts = arg.split('=', 2);
      const part0 = parts[0];
      if (!part0) return null;
      flagName = part0;
      inlineValue = parts[1];
    } else {
      // Format: --key
      flagName = arg;
    }

    // Remove leading dashes
    const key = flagName.replace(/^--?/, '');

    // If there's an inline value, use it
    if (inlineValue !== undefined) {
      return {
        key,
        value: this.parseValue(inlineValue),
        consumed: 1
      };
    }

    // Check if next argument is a value (not a flag)
    const nextArg = args[index + 1];

    if (!nextArg || nextArg.startsWith('-')) {
      // Boolean flag (no value)
      return {
        key,
        value: 'true',
        consumed: 1
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

    // If we collected multiple values, return as array
    if (values.length > 1) {
      // Flatten any comma-separated values
      const flattened = values.flatMap(v => this.parseValue(v));
      return {
        key,
        value: Array.isArray(flattened) ? flattened.flat() : flattened,
        consumed
      };
    }

    // Single value
    const firstValue = values[0];
    if (!firstValue) {
      // No value - treat as boolean flag
      return {
        key,
        value: 'true',
        consumed: 1
      };
    }

    return {
      key,
      value: this.parseValue(firstValue),
      consumed
    };
  }

  /**
   * Parse a value (handle comma-separated lists)
   */
  private static parseValue(value: string): string | string[] {
    // Check if value contains commas (array)
    if (value.includes(',')) {
      return value
        .split(',')
        .map(v => v.trim())
        .filter(v => v.length > 0);
    }

    return value;
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
    }
  ): Map<string, string | string[]> {
    const booleanFlags = new Set(schema.booleanFlags || []);
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

      let flagName: string;
      let inlineValue: string | undefined;

      if (arg.includes('=')) {
        const parts = arg.split('=', 2);
        const part0 = parts[0];
        if (!part0) {
          i++;
          continue;
        }
        flagName = part0.replace(/^--?/, '');
        inlineValue = parts[1];
      } else {
        flagName = arg.replace(/^--?/, '');
      }

      // Check if this is a boolean flag
      if (booleanFlags.has(flagName)) {
        result.set(flagName, inlineValue || 'true');
        i++;
        continue;
      }

      // Handle inline value
      if (inlineValue !== undefined) {
        const value = this.parseValue(inlineValue);
        this.mergeValue(result, flagName, value);
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
          const value = this.parseValue(firstVal);
          this.mergeValue(result, flagName, value);
        }
      } else {
        const flattened = values.flatMap(v => this.parseValue(v));
        this.mergeValue(result, flagName, flattened);
      }

      i = j;
    }

    return result;
  }

  /**
   * Merge a value into the result map
   */
  private static mergeValue(
    result: Map<string, string | string[]>,
    key: string,
    value: string | string[]
  ): void {
    const existing = result.get(key);

    if (existing === undefined) {
      result.set(key, value);
      return;
    }

    // Merge with existing value
    const existingArray = Array.isArray(existing) ? existing : [existing];
    const newArray = Array.isArray(value) ? value : [value];
    result.set(key, [...existingArray, ...newArray]);
  }
}
