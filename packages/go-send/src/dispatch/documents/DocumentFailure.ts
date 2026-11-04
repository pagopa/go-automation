import type { DispatchError } from '../DispatchError.js';
import type { RowError } from '../model/RowError.js';

/**
 * A row whose documents cannot be resolved: the error recorded on the row
 * and, when the cause would hit every row, the run-level error that stops
 * the run.
 */
export interface DocumentFailure {
  readonly rowError: RowError;
  readonly runError?: DispatchError;
}
