import type { ValidationErrorEntry } from './ValidationErrorEntry.js';

/**
 * Error thrown when runbook validation fails.
 * Contains all errors found during validation.
 */
export class RunbookValidationError extends Error {
  override readonly name = 'RunbookValidationError';

  constructor(
    readonly runbookId: string,
    readonly errors: ReadonlyArray<ValidationErrorEntry>,
  ) {
    const errorList = errors.map((e, i) => `  ${i + 1}. [${e.code}] ${e.message}`).join('\n');
    super(`Validation failed for runbook "${runbookId}" (${errors.length} errors):\n${errorList}`);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
