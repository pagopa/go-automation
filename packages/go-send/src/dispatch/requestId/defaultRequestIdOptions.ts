import type { RequestIdSelectionOptions } from './RequestIdSelectionOptions.js';

/**
 * Defaults of §8.3: same rule as the `jq` used so far (analog, then
 * digital; first by timestamp; id as is), concluded at the first category
 * found, early stop on the end-of-workflow categories. `DIGITAL_FAILURE_WORKFLOW`
 * is not an end: a simple registered letter follows it (A12).
 */
export const DEFAULT_REQUEST_ID_OPTIONS: RequestIdSelectionOptions = {
  categories: ['PREPARE_ANALOG_DOMICILE', 'PREPARE_DIGITAL_DOMICILE'],
  select: 'per-category',
  wait: 'any',
  endCategories: [
    'REQUEST_REFUSED',
    'NOTIFICATION_CANCELLED',
    'DIGITAL_SUCCESS_WORKFLOW',
    'ANALOG_SUCCESS_WORKFLOW',
    'ANALOG_FAILURE_WORKFLOW',
    'COMPLETELY_UNREACHABLE',
  ],
};
