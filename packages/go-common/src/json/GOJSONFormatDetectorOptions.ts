/**
 * Options for GOJSONFormatDetector
 */

/**
 * Analysis depth levels for format detection
 *
 * - `extension`: File extension only (.json, .jsonl, .ndjson). No I/O.
 * - `shallow`: Extension + first significant byte. ~64 bytes read.
 * - `standard`: Extension + parse first N lines individually. High reliability.
 * - `deep`: Standard + sampling from middle and end of file. Highest reliability.
 */
export type GOJSONDetectionDepth = 'extension' | 'shallow' | 'standard' | 'deep';

/**
 * Configuration for GOJSONFormatDetector
 */
export interface GOJSONFormatDetectorOptions {
  /** Analysis depth (default: 'standard') */
  readonly depth?: GOJSONDetectionDepth;

  /** Number of lines to sample at each analysis point (default: 10) */
  readonly sampleLines?: number;
}

/**
 * Result of a format detection operation
 */
export interface GOJSONFormatDetectionResult {
  /** Detected format */
  readonly format: 'json' | 'jsonl' | 'unknown';

  /** Confidence level between 0 and 1 */
  readonly confidence: number;

  /** Detection method used */
  readonly method: GOJSONDetectionDepth;

  /** Diagnostic details */
  readonly details: string;
}
