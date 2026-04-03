/**
 * Core JSON utilities
 *
 * Field path navigation, field extraction, and format detection
 * for JSON and NDJSON/JSONL files.
 */

// Field path navigation
export { parseFieldPath, navigateFieldPath } from './fieldPath.js';

// Field extraction
export { GOJSONFieldExtractor } from './GOJSONFieldExtractor.js';
export type { GOJSONFieldExtractorOptions } from './GOJSONFieldExtractorOptions.js';

// Format detection
export { GOJSONFormatDetector } from './GOJSONFormatDetector.js';
export type {
  GOJSONDetectionDepth,
  GOJSONFormatDetectorOptions,
  GOJSONFormatDetectionResult,
} from './GOJSONFormatDetectorOptions.js';

// Format type
export type { GOJSONFormat } from './GOJSONFormat.js';
