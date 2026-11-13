/**
 * Configuration Validation
 *
 * Utilities for validating configuration parameters,
 * detecting unknown flags, and providing suggestions.
 */

export { damerauLevenshteinDistance } from './GOStringDistance.js';
export {
  GOUnknownParameterDetector,
  type ParameterSuggestion,
  type UnknownParameterError,
} from './GOUnknownParameterDetector.js';
