import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { GOJSONFormatDetector } from '../GOJSONFormatDetector.js';
import type { GOJSONDetectionDepth, GOJSONFormatDetectionResult } from '../GOJSONFormatDetectorOptions.js';

/** Formats the detector can report. */
type DetectedFormat = 'json' | 'jsonl' | 'unknown';

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');

/** Expected detection; `minConfidence` is used when the exact value is not the point. */
interface DetectionExpectation {
  readonly format: DetectedFormat;
  readonly method?: GOJSONDetectionDepth;
  readonly confidence?: number;
  readonly minConfidence?: number;
  readonly details?: string;
}

/** A detection case: a fixture file name (for detect) or inline content (for detectFromContent). */
interface DetectionCase extends DetectionExpectation {
  readonly input: string;
}

/** Asserts a detection result against the expectation, labelled with the case input. */
function assertDetection(result: GOJSONFormatDetectionResult, expected: DetectionCase): void {
  const label = JSON.stringify(expected.input);
  assert.strictEqual(result.format, expected.format, label);
  if (expected.method !== undefined) assert.strictEqual(result.method, expected.method, label);
  if (expected.confidence !== undefined) assert.strictEqual(result.confidence, expected.confidence, label);
  if (expected.minConfidence !== undefined) assert.ok(result.confidence >= expected.minConfidence, label);
  if (expected.details !== undefined) assert.ok(result.details.includes(expected.details), result.details);
}

/** Runs every fixture case through `detector.detect`. */
async function assertFileDetections(
  detector: GOJSONFormatDetector,
  cases: ReadonlyArray<DetectionCase>,
): Promise<void> {
  for (const expected of cases) {
    assertDetection(await detector.detect(path.join(FIXTURES_DIR, expected.input)), expected);
  }
}

describe('GOJSONFormatDetector', () => {
  it('detectFromContent classifies in-memory content', () => {
    const detector = new GOJSONFormatDetector();
    const cases: ReadonlyArray<DetectionCase> = [
      { input: '[{"id":1},{"id":2}]', format: 'json', confidence: 0.95 },
      { input: '  \n  [1, 2, 3]', format: 'json', confidence: 0.95 },
      {
        input: '{"id":1,"name":"Alice"}\n{"id":2,"name":"Bob"}\n{"id":3,"name":"Charlie"}',
        format: 'jsonl',
        minConfidence: 0.7,
      },
      { input: '{"a":1}\n\n{"b":2}\n\n{"c":3}', format: 'jsonl' },
      { input: '{\n  "name": "Alice",\n  "address": {\n    "city": "Rome"\n  }\n}', format: 'json', confidence: 0.85 },
      { input: '{"id":1}', format: 'unknown', confidence: 0.5, details: 'ambiguous' },
      { input: '   \n  \n  ', format: 'unknown', confidence: 0 },
      { input: 'hello world', format: 'unknown', confidence: 0, details: 'Unexpected first character' },
      // Default sampleLines=10: only the first 10 of 15 lines are sampled.
      {
        input: Array.from({ length: 15 }, (_, i) => JSON.stringify({ id: i })).join('\n'),
        format: 'jsonl',
        details: '10/10',
      },
    ];
    for (const expected of cases) {
      assertDetection(detector.detectFromContent(expected.input), expected);
    }
  });

  it("depth 'extension' relies on the (case-insensitive) extension only", async () => {
    await assertFileDetections(new GOJSONFormatDetector({ depth: 'extension' }), [
      { input: 'array.json', format: 'json', method: 'extension', confidence: 0.7 },
      { input: 'data.JSON', format: 'json', method: 'extension' },
      { input: 'data.jsonl', format: 'jsonl', method: 'extension', confidence: 0.9 },
      { input: 'data.ndjson', format: 'jsonl', method: 'extension', confidence: 0.9 },
      { input: 'data.txt', format: 'unknown', confidence: 0 },
      { input: 'noext', format: 'unknown', details: '(none)' },
      // Only the file name counts: a dot in a directory is not an extension (the file is not read).
      { input: 'exports.v2/data', format: 'unknown', details: 'Unrecognized extension: (none)' },
    ]);
  });

  it("depth 'shallow' trusts a JSONL extension, otherwise reads the first significant byte", async () => {
    await assertFileDetections(new GOJSONFormatDetector({ depth: 'shallow' }), [
      { input: 'not-json-content.jsonl', format: 'jsonl', method: 'extension', confidence: 0.9 },
      { input: 'array.json', format: 'json', method: 'shallow', confidence: 0.85 },
      { input: 'whitespace-then-array.json', format: 'json', method: 'shallow' },
      { input: 'single-object.json', format: 'unknown', method: 'shallow', confidence: 0.5 },
      { input: 'empty.json', format: 'unknown', method: 'shallow', confidence: 0 },
      { input: 'not-json.json', format: 'unknown', confidence: 0, details: 'Unexpected' },
    ]);
  });

  it("depth 'standard' (the default) analyses the first lines", async () => {
    await assertFileDetections(new GOJSONFormatDetector(), [
      { input: 'data.jsonl', format: 'jsonl', method: 'standard', confidence: 0.9 },
      { input: 'array.json', format: 'json', method: 'standard', confidence: 0.95 },
      { input: 'jsonl-10.json', format: 'jsonl', method: 'standard', confidence: 0.95 },
      { input: 'pretty-nested.json', format: 'json', method: 'standard', details: 'lines parse as JSON' },
      { input: 'blanks-only.json', format: 'unknown', method: 'standard', confidence: 0 },
      { input: 'dotted.data.dir/file.json', format: 'json', method: 'standard' },
      // Real-world samples.
      { input: 'cloudwatch-response.json', format: 'json' },
      { input: 'dynamo-scan.json', format: 'json' },
      { input: 'sqs-export.json', format: 'jsonl' },
      // A minified single-line object is ambiguous (one JSON object or one-line JSONL).
      { input: 'dynamo-minified.json', format: 'unknown', confidence: 0.5 },
    ]);
  });

  it("depth 'standard' honours the sampleLines option", async () => {
    await assertFileDetections(new GOJSONFormatDetector({ depth: 'standard', sampleLines: 3 }), [
      { input: 'jsonl-20.json', format: 'jsonl', details: '3/3' },
    ]);
  });

  it("depth 'deep' samples the middle and end of large JSONL candidates", async () => {
    // Deep sampling needs standard confidence < 0.95, i.e.
    // 0.7 + (linesToTest / sampleLines) * 0.25 < 0.95: fewer than 20 lines with sampleLines=20.
    await assertFileDetections(new GOJSONFormatDetector({ depth: 'deep', sampleLines: 20 }), [
      // 8 long lines (~1.8KB): standard gives 0.8, deep samples confirm and boost it.
      {
        input: 'jsonl-8-padded.json',
        format: 'jsonl',
        method: 'deep',
        minConfidence: 0.84,
        details: 'Confirmed JSONL',
      },
      // Small file (<1KB): the standard result is kept, tagged as deep.
      { input: 'jsonl-3.json', format: 'jsonl', method: 'deep' },
      // Samples land in blank padding: nothing to sample, the standard result is kept.
      { input: 'jsonl-blank-padded.json', format: 'jsonl', method: 'deep' },
      // Non-JSONL: the standard result is returned as-is.
      { input: 'array.json', format: 'json', method: 'standard' },
    ]);
  });

  it("depth 'deep' skips sampling when standard confidence is already >= 0.95", async () => {
    await assertFileDetections(new GOJSONFormatDetector({ depth: 'deep' }), [
      { input: 'jsonl-200-padded.json', format: 'jsonl', method: 'standard', minConfidence: 0.95 },
    ]);
  });
});
