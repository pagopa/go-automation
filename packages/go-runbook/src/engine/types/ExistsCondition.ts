/**
 * Verifies that a value exists.
 *
 * - For scalars: non-undefined, non-null, non-empty string.
 * - For arrays: array `length > 0`.
 */
export interface ExistsCondition {
  readonly type: 'exists';
  readonly ref: string;
}
