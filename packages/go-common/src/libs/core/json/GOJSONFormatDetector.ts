/**
 * JSON Format Detector
 *
 * Detects whether a file is standard JSON or NDJSON/JSONL using configurable
 * analysis depth levels:
 * - extension: file extension only
 * - shallow: extension + first significant byte
 * - standard: extension + parse first N lines individually
 * - deep: standard + sampling from middle and end of file
 */

import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import * as readline from 'readline';
import type {
  GOJSONDetectionDepth,
  GOJSONFormatDetectorOptions,
  GOJSONFormatDetectionResult,
} from './GOJSONFormatDetectorOptions.js';

const DEFAULT_DEPTH: GOJSONDetectionDepth = 'standard';
const DEFAULT_SAMPLE_LINES = 10;

/** Known JSONL file extensions */
const JSONL_EXTENSIONS = new Set(['.jsonl', '.ndjson']);
/** Known JSON file extensions */
const JSON_EXTENSIONS = new Set(['.json']);

/**
 * Detects JSON file format (standard JSON vs NDJSON/JSONL) with configurable analysis depth.
 *
 * @example
 * ```typescript
 * const detector = new GOJSONFormatDetector({ depth: 'standard', sampleLines: 15 });
 * const result = await detector.detect('/path/to/file.json');
 * // { format: 'json', confidence: 0.95, method: 'standard', details: '...' }
 * ```
 */
export class GOJSONFormatDetector {
  private readonly depth: GOJSONDetectionDepth;
  private readonly sampleLines: number;

  constructor(options?: GOJSONFormatDetectorOptions) {
    this.depth = options?.depth ?? DEFAULT_DEPTH;
    this.sampleLines = options?.sampleLines ?? DEFAULT_SAMPLE_LINES;
  }

  /**
   * Detects the format of a JSON file.
   *
   * @param filePath - Absolute path to the file to analyze
   * @returns Detection result with format, confidence, and diagnostic details
   */
  async detect(filePath: string): Promise<GOJSONFormatDetectionResult> {
    switch (this.depth) {
      case 'extension':
        return this.detectByExtension(filePath);
      case 'shallow':
        return this.detectShallow(filePath);
      case 'standard':
        return this.detectStandard(filePath);
      case 'deep':
        return this.detectDeep(filePath);
      default: {
        const exhaustive: never = this.depth;
        throw new Error(`Unknown detection depth: ${String(exhaustive)}`);
      }
    }
  }

  /**
   * Detects format from in-memory content (synchronous).
   * Uses line-based analysis equivalent to 'standard' depth.
   *
   * @param content - Raw file content as string
   * @returns Detection result
   */
  detectFromContent(content: string): GOJSONFormatDetectionResult {
    const trimmed = content.trimStart();

    if (trimmed.length === 0) {
      return { format: 'unknown', confidence: 0, method: 'standard', details: 'Empty content' };
    }

    // Starts with '[' → JSON array
    if (trimmed.charAt(0) === '[') {
      return { format: 'json', confidence: 0.95, method: 'standard', details: 'Content starts with [' };
    }

    // Try line-by-line analysis
    if (trimmed.charAt(0) === '{') {
      return this.analyzeLines(trimmed.split('\n'));
    }

    return {
      format: 'unknown',
      confidence: 0,
      method: 'standard',
      details: `Unexpected first character: ${trimmed.charAt(0)}`,
    };
  }

  // ── Extension-only detection ────────────────────────────────────────

  private detectByExtension(filePath: string): GOJSONFormatDetectionResult {
    const ext = this.getExtension(filePath);

    if (JSONL_EXTENSIONS.has(ext)) {
      return { format: 'jsonl', confidence: 0.9, method: 'extension', details: `Extension: ${ext}` };
    }
    if (JSON_EXTENSIONS.has(ext)) {
      return { format: 'json', confidence: 0.7, method: 'extension', details: `Extension: ${ext}` };
    }

    return {
      format: 'unknown',
      confidence: 0,
      method: 'extension',
      details: `Unrecognized extension: ${ext || '(none)'}`,
    };
  }

  // ── Shallow detection (extension + first bytes) ─────────────────────

  private async detectShallow(filePath: string): Promise<GOJSONFormatDetectionResult> {
    // Start with extension hint
    const extResult = this.detectByExtension(filePath);
    if (extResult.format === 'jsonl' || extResult.confidence >= 0.9) {
      return extResult;
    }

    // Read first 64 bytes
    const handle = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(64);
      const { bytesRead } = await handle.read(buffer, 0, 64, 0);

      if (bytesRead === 0) {
        return { format: 'unknown', confidence: 0, method: 'shallow', details: 'Empty file' };
      }

      const start = buffer.subarray(0, bytesRead).toString('utf8').trimStart();
      const firstChar = start.charAt(0);

      if (firstChar === '[') {
        return { format: 'json', confidence: 0.85, method: 'shallow', details: 'First significant byte: [' };
      }
      if (firstChar === '{') {
        // Ambiguous — could be single JSON object or JSONL
        return {
          format: 'unknown',
          confidence: 0.5,
          method: 'shallow',
          details: 'First significant byte: { (ambiguous)',
        };
      }

      return {
        format: 'unknown',
        confidence: 0,
        method: 'shallow',
        details: `Unexpected first character: ${firstChar}`,
      };
    } finally {
      await handle.close();
    }
  }

  // ── Standard detection (extension + first N lines) ──────────────────

  private async detectStandard(filePath: string): Promise<GOJSONFormatDetectionResult> {
    // Quick win from extension
    const ext = this.getExtension(filePath);
    if (JSONL_EXTENSIONS.has(ext)) {
      return { format: 'jsonl', confidence: 0.9, method: 'standard', details: `JSONL extension: ${ext}` };
    }

    // Read first N lines
    const lines = await this.readFirstLines(filePath, this.sampleLines);

    if (lines.length === 0) {
      return { format: 'unknown', confidence: 0, method: 'standard', details: 'Empty file' };
    }

    const firstLine = lines[0];
    if (firstLine === undefined) {
      return { format: 'unknown', confidence: 0, method: 'standard', details: 'Empty file' };
    }

    // Starts with '[' → JSON array
    if (firstLine.trimStart().startsWith('[')) {
      return { format: 'json', confidence: 0.95, method: 'standard', details: 'First line starts with [' };
    }

    return this.analyzeLines(lines);
  }

  // ── Deep detection (standard + middle/end sampling) ─────────────────

  private async detectDeep(filePath: string): Promise<GOJSONFormatDetectionResult> {
    // Run standard detection first
    const standardResult = await this.detectStandard(filePath);

    // If already high confidence or not JSONL, return
    if (standardResult.format !== 'jsonl' || standardResult.confidence >= 0.95) {
      return standardResult;
    }

    // For JSONL candidates, verify by sampling middle and end of file
    const stat = await fs.stat(filePath);
    const fileSize = stat.size;

    if (fileSize < 1024) {
      // Small file — standard is already sufficient
      return { ...standardResult, method: 'deep' };
    }

    // Sample from ~40% position
    const middleLines = await this.readLinesAtOffset(filePath, Math.floor(fileSize * 0.4), this.sampleLines);
    const middleValid = this.countValidJsonLines(middleLines);

    // Sample from ~80% position
    const endLines = await this.readLinesAtOffset(filePath, Math.floor(fileSize * 0.8), this.sampleLines);
    const endValid = this.countValidJsonLines(endLines);

    const totalSampled = middleLines.length + endLines.length;
    const totalValid = middleValid + endValid;

    if (totalSampled === 0) {
      return { ...standardResult, method: 'deep' };
    }

    const deepRatio = totalValid / totalSampled;

    if (deepRatio >= 0.8) {
      return {
        format: 'jsonl',
        confidence: Math.min(0.98, standardResult.confidence + deepRatio * 0.05),
        method: 'deep',
        details: `Confirmed JSONL: ${totalValid}/${totalSampled} deep samples valid (${middleValid} middle, ${endValid} end)`,
      };
    }

    // Mismatch between head and body — reduce confidence
    return {
      format: standardResult.format,
      confidence: standardResult.confidence * 0.7,
      method: 'deep',
      details: `Deep sampling inconsistent: ${totalValid}/${totalSampled} valid (expected JSONL)`,
    };
  }

  // ── Shared analysis helpers ─────────────────────────────────────────

  /**
   * Analyzes an array of lines to determine if they are individual JSON objects (JSONL)
   * or part of a single JSON structure (pretty-printed JSON).
   */
  private analyzeLines(lines: ReadonlyArray<string>): GOJSONFormatDetectionResult {
    const nonEmptyLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        nonEmptyLines.push(trimmed);
      }
    }

    if (nonEmptyLines.length === 0) {
      return { format: 'unknown', confidence: 0, method: 'standard', details: 'No non-empty lines' };
    }

    let validJsonObjects = 0;
    const linesToTest = Math.min(nonEmptyLines.length, this.sampleLines);

    for (let i = 0; i < linesToTest; i++) {
      const line = nonEmptyLines[i];
      if (line === undefined) continue;
      if (this.isCompleteJsonObject(line)) {
        validJsonObjects++;
      }
    }

    // All sampled lines are valid JSON objects → JSONL
    if (validJsonObjects === linesToTest && linesToTest >= 2) {
      const confidence = Math.min(0.95, 0.7 + (linesToTest / this.sampleLines) * 0.25);
      return {
        format: 'jsonl',
        confidence,
        method: 'standard',
        details: `${validJsonObjects}/${linesToTest} lines are valid JSON objects`,
      };
    }

    // Only first line is valid → could be single-line JSON object (not JSONL)
    if (validJsonObjects === 1 && linesToTest === 1) {
      return {
        format: 'unknown',
        confidence: 0.5,
        method: 'standard',
        details: 'Single line valid JSON object (ambiguous: could be JSON or single-line JSONL)',
      };
    }

    // Most lines are NOT valid JSON individually → pretty-printed JSON
    if (validJsonObjects < linesToTest) {
      return {
        format: 'json',
        confidence: 0.85,
        method: 'standard',
        details: `Only ${validJsonObjects}/${linesToTest} lines parse as JSON (likely pretty-printed JSON)`,
      };
    }

    return { format: 'unknown', confidence: 0, method: 'standard', details: 'Unable to determine format' };
  }

  /**
   * Tests if a string is a complete, self-contained JSON object or array.
   * Uses a try/catch on JSON.parse — intentionally simple and reliable.
   */
  private isCompleteJsonObject(line: string): boolean {
    if (line.length < 2) return false;

    const first = line.charAt(0);
    if (first !== '{' && first !== '[') return false;

    try {
      JSON.parse(line);
      return true;
    } catch {
      return false;
    }
  }

  /** Counts how many lines in the array are valid JSON objects */
  private countValidJsonLines(lines: ReadonlyArray<string>): number {
    let count = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0 && this.isCompleteJsonObject(trimmed)) {
        count++;
      }
    }
    return count;
  }

  // ── I/O helpers ─────────────────────────────────────────────────────

  /** Reads the first N non-empty lines from a file using streaming */
  private async readFirstLines(filePath: string, maxLines: number): Promise<string[]> {
    const lines: string[] = [];

    const stream = createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    try {
      for await (const rawLine of rl) {
        const trimmed = rawLine.trim();
        if (trimmed.length > 0) {
          lines.push(trimmed);
          if (lines.length >= maxLines) break;
        }
      }
    } finally {
      rl.close();
      stream.destroy();
    }

    return lines;
  }

  /** Reads N lines starting from a byte offset (for deep sampling) */
  private async readLinesAtOffset(filePath: string, byteOffset: number, maxLines: number): Promise<string[]> {
    const lines: string[] = [];
    let skippedPartial = false;

    const stream = createReadStream(filePath, { encoding: 'utf8', start: byteOffset });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    try {
      for await (const rawLine of rl) {
        // Skip the first line since we likely landed mid-line
        if (!skippedPartial) {
          skippedPartial = true;
          continue;
        }

        const trimmed = rawLine.trim();
        if (trimmed.length > 0) {
          lines.push(trimmed);
          if (lines.length >= maxLines) break;
        }
      }
    } finally {
      rl.close();
      stream.destroy();
    }

    return lines;
  }

  /** Extracts lowercase file extension including the dot */
  private getExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    if (lastDot === -1 || lastDot === filePath.length - 1) return '';
    return filePath.slice(lastDot).toLowerCase();
  }
}
