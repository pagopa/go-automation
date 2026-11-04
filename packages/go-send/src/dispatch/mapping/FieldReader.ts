import type { CanonicalField } from './CanonicalField.js';
import type { FieldValues } from './FieldValues.js';
import type { RecordBuildFailure } from './RecordBuildFailure.js';
import type { ValidationIssue } from './ValidationIssue.js';

const NON_NEGATIVE_INTEGER = /^\d+$/;

/**
 * Reads the field values of a row and accumulates validation issues, so a
 * builder reports **all** the problems of a row instead of the first one.
 *
 * Contract of the reading methods (and of the readers built on them in
 * `recordReaders.ts`): when a **required** value comes back `undefined`, an
 * issue has been recorded. Builders can therefore return {@link failure} as
 * soon as a required value is missing, without placeholder values.
 */
export class FieldReader {
  private readonly collected: ValidationIssue[] = [];

  constructor(
    private readonly values: FieldValues,
    private readonly defaults: ReadonlyMap<CanonicalField, string> = new Map(),
  ) {}

  /** Issues recorded so far, in reading order. */
  public get issues(): ReadonlyArray<ValidationIssue> {
    return this.collected;
  }

  /**
   * Whether any issue has been recorded.
   *
   * @returns `true` when the row is invalid
   */
  public hasIssues(): boolean {
    return this.collected.length > 0;
  }

  /**
   * The failed outcome of the row. Should a reader return `undefined` for a
   * required value without recording an issue (a broken contract), an
   * `INTERNAL` issue is added, so an invalid row always says why.
   *
   * @returns Failure with the recorded issues
   */
  public failure(): RecordBuildFailure {
    if (this.collected.length === 0) {
      this.issue('INTERNAL', undefined, 'the row could not be built, but no validation issue was recorded');
    }
    return { ok: false, issues: [...this.collected] };
  }

  /**
   * Raw value of a field, without neutral defaults.
   *
   * @param field - Canonical field
   * @returns The value, if set
   */
  public value(field: CanonicalField): string | undefined {
    return this.values.get(field);
  }

  /**
   * Value of a field, or its neutral default.
   *
   * @param field - Canonical field
   * @returns The value or the default, if any
   */
  public valueOrDefault(field: CanonicalField): string | undefined {
    return this.values.get(field) ?? this.defaults.get(field);
  }

  /**
   * Records an issue.
   *
   * @param code - Stable issue code
   * @param field - Offending field, if any
   * @param message - Human-readable message
   */
  public issue(code: string, field: CanonicalField | undefined, message: string): void {
    this.collected.push({ code, message, ...(field !== undefined && { field }) });
  }

  /**
   * Reads a required field (or its neutral default) with a maximum length.
   *
   * @param field - Canonical field
   * @param maxLength - Maximum length
   * @returns The value; `undefined` with an issue when missing or too long
   */
  public required(field: CanonicalField, maxLength: number): string | undefined {
    const value = this.valueOrDefault(field);
    if (value === undefined) {
      this.issue('MISSING_FIELD', field, `${field} is required`);
      return undefined;
    }
    return this.checkLength(field, value, maxLength);
  }

  /**
   * Reads an optional field with a maximum length.
   *
   * @param field - Canonical field
   * @param maxLength - Maximum length
   * @returns The value; `undefined` when absent, or with an issue when too long
   */
  public optional(field: CanonicalField, maxLength: number): string | undefined {
    const value = this.values.get(field);
    return value === undefined ? undefined : this.checkLength(field, value, maxLength);
  }

  /**
   * Reads a field (or its neutral default) that must match a pattern.
   *
   * @param field - Canonical field
   * @param pattern - Expected format
   * @param expected - Description of the format, for the message
   * @param isRequired - Whether a missing value is an issue
   * @returns The value; `undefined` when absent, or with an issue when missing (if required) or malformed
   */
  public matching(field: CanonicalField, pattern: RegExp, expected: string, isRequired: boolean): string | undefined {
    return this.checkPattern(field, this.valueOrDefault(field), pattern, expected, isRequired);
  }

  /**
   * Like {@link matching}, on the upper-cased value (codes written in any case).
   *
   * @param field - Canonical field
   * @param pattern - Expected format, in upper case
   * @param expected - Description of the format, for the message
   * @param isRequired - Whether a missing value is an issue
   * @returns The upper-cased value; `undefined` as for {@link matching}
   */
  public matchingUpperCase(
    field: CanonicalField,
    pattern: RegExp,
    expected: string,
    isRequired: boolean,
  ): string | undefined {
    return this.checkPattern(field, this.valueOrDefault(field)?.toUpperCase(), pattern, expected, isRequired);
  }

  /**
   * Reads an enumerated field (or its neutral default), case-insensitively.
   *
   * @param field - Canonical field
   * @param allowed - Allowed values, in upper case
   * @param isRequired - Whether a missing value is an issue
   * @returns The upper-cased value; `undefined` when absent, or with an issue when missing (if required) or not allowed
   */
  public oneOf<T extends string>(field: CanonicalField, allowed: ReadonlySet<T>, isRequired: boolean): T | undefined {
    const value = this.valueOrDefault(field)?.toUpperCase();
    if (value === undefined) {
      if (isRequired) this.issue('MISSING_FIELD', field, `${field} is required`);
      return undefined;
    }
    if (isMember(allowed, value)) return value;
    this.issue('INVALID_ENUM', field, `${field} "${value}" must be one of ${[...allowed].join(', ')}`);
    return undefined;
  }

  /**
   * Reads an optional non-negative integer.
   *
   * @param field - Canonical field
   * @param unit - Unit of the value, for the message (e.g. `euro cents`, `percent`)
   * @param max - Inclusive upper bound, if any
   * @returns The number; `undefined` when absent, or with an issue when malformed or out of range
   */
  public integer(field: CanonicalField, unit: string, max?: number): number | undefined {
    const value = this.values.get(field);
    if (value === undefined) return undefined;
    if (!NON_NEGATIVE_INTEGER.test(value)) {
      this.issue('INVALID_FORMAT', field, `${field} "${value}" must be a non-negative integer (${unit})`);
      return undefined;
    }
    const parsed = Number(value);
    if (max !== undefined && parsed > max) {
      this.issue('OUT_OF_RANGE', field, `${field} ${parsed} must be at most ${max} (${unit})`);
      return undefined;
    }
    return parsed;
  }

  private checkPattern(
    field: CanonicalField,
    value: string | undefined,
    pattern: RegExp,
    expected: string,
    isRequired: boolean,
  ): string | undefined {
    if (value === undefined) {
      if (isRequired) this.issue('MISSING_FIELD', field, `${field} is required`);
      return undefined;
    }
    if (!pattern.test(value)) {
      this.issue('INVALID_FORMAT', field, `${field} "${value}" must be ${expected}`);
      return undefined;
    }
    return value;
  }

  private checkLength(field: CanonicalField, value: string, maxLength: number): string | undefined {
    if (value.length <= maxLength) return value;
    this.issue('TOO_LONG', field, `${field} exceeds ${maxLength} characters (${value.length})`);
    return undefined;
  }
}

function isMember<T extends string>(allowed: ReadonlySet<T>, value: string): value is T {
  const members: ReadonlySet<string> = allowed;
  return members.has(value);
}
