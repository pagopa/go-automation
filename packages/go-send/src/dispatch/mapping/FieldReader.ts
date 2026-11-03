import type { CanonicalField } from './CanonicalField.js';
import type { FieldValues } from './FieldValues.js';
import type { ValidationIssue } from './ValidationIssue.js';

const NON_NEGATIVE_INTEGER = /^\d+$/;

/**
 * Reads the field values of a row and accumulates validation issues, so a
 * builder reports **all** the problems of a row instead of the first one.
 */
export class FieldReader {
  public readonly issues: ValidationIssue[] = [];

  constructor(
    private readonly values: FieldValues,
    private readonly defaults: ReadonlyMap<CanonicalField, string> = new Map(),
  ) {}

  public value(field: CanonicalField): string | undefined {
    return this.values.get(field);
  }

  public valueOrDefault(field: CanonicalField): string | undefined {
    return this.values.get(field) ?? this.defaults.get(field);
  }

  public issue(code: string, field: CanonicalField | undefined, message: string): void {
    this.issues.push({ code, message, ...(field !== undefined && { field }) });
  }

  public required(field: CanonicalField, maxLength: number): string | undefined {
    const value = this.valueOrDefault(field);
    if (value === undefined) {
      this.issue('MISSING_FIELD', field, `${field} is required`);
      return undefined;
    }
    return this.checkLength(field, value, maxLength);
  }

  public optional(field: CanonicalField, maxLength: number): string | undefined {
    const value = this.values.get(field);
    return value === undefined ? undefined : this.checkLength(field, value, maxLength);
  }

  public matching(field: CanonicalField, pattern: RegExp, expected: string, isRequired: boolean): string | undefined {
    const value = this.valueOrDefault(field);
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

  public oneOf(field: CanonicalField, allowed: ReadonlySet<string>): string | undefined {
    const value = this.valueOrDefault(field)?.toUpperCase();
    if (value === undefined || allowed.has(value)) return value;
    this.issue('INVALID_ENUM', field, `${field} "${value}" must be one of ${[...allowed].join(', ')}`);
    return undefined;
  }

  public integer(field: CanonicalField): number | undefined {
    const value = this.values.get(field);
    if (value === undefined) return undefined;
    if (!NON_NEGATIVE_INTEGER.test(value)) {
      this.issue('INVALID_FORMAT', field, `${field} "${value}" must be a non-negative integer (euro cents)`);
      return undefined;
    }
    return Number(value);
  }

  private checkLength(field: CanonicalField, value: string, maxLength: number): string | undefined {
    if (value.length <= maxLength) return value;
    this.issue('TOO_LONG', field, `${field} exceeds ${maxLength} characters (${value.length})`);
    return undefined;
  }
}
