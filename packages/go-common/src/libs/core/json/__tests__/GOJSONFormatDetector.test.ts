/**
 * Tests for GOJSONFormatDetector
 *
 * Covers all four detection depths (extension, shallow, standard, deep),
 * the synchronous detectFromContent() method, and edge cases.
 *
 * File-based tests use static fixture files from the __fixtures__/ directory.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { GOJSONFormatDetector } from '../GOJSONFormatDetector.js';

// ── Fixture helper ──────────────────────────────────────────────────────────

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');

/** Returns the absolute path to a fixture file */
function fixture(name: string): string {
  return path.join(FIXTURES_DIR, name);
}

// ── detectFromContent (synchronous, in-memory) ─────────────────────────────

describe('GOJSONFormatDetector.detectFromContent', () => {
  const detector = new GOJSONFormatDetector();

  it('detects JSON array', () => {
    const result = detector.detectFromContent('[{"id":1},{"id":2}]');
    assert.strictEqual(result.format, 'json');
    assert.ok(result.confidence >= 0.9);
  });

  it('detects pretty-printed JSON array', () => {
    const content = `[
  {"id": 1},
  {"id": 2}
]`;
    const result = detector.detectFromContent(content);
    assert.strictEqual(result.format, 'json');
  });

  it('detects JSONL content (multiple JSON objects per line)', () => {
    const content = `{"id":1,"name":"Alice"}
{"id":2,"name":"Bob"}
{"id":3,"name":"Charlie"}`;
    const result = detector.detectFromContent(content);
    assert.strictEqual(result.format, 'jsonl');
    assert.ok(result.confidence >= 0.7);
  });

  it('detects pretty-printed single JSON object', () => {
    const content = `{
  "name": "Alice",
  "age": 30,
  "address": {
    "city": "Rome"
  }
}`;
    const result = detector.detectFromContent(content);
    assert.strictEqual(result.format, 'json');
    assert.ok(result.confidence >= 0.8);
  });

  it('returns unknown for empty content', () => {
    const result = detector.detectFromContent('');
    assert.strictEqual(result.format, 'unknown');
    assert.strictEqual(result.confidence, 0);
  });

  it('returns unknown for whitespace-only content', () => {
    const result = detector.detectFromContent('   \n  \n  ');
    assert.strictEqual(result.format, 'unknown');
    assert.strictEqual(result.confidence, 0);
  });

  it('returns unknown for unexpected first character', () => {
    const result = detector.detectFromContent('hello world');
    assert.strictEqual(result.format, 'unknown');
    assert.ok(result.details.includes('Unexpected first character'));
  });

  it('handles content with leading whitespace', () => {
    const result = detector.detectFromContent('  \n  [1, 2, 3]');
    assert.strictEqual(result.format, 'json');
  });

  it('returns ambiguous for single-line JSON object', () => {
    const result = detector.detectFromContent('{"id":1}');
    assert.strictEqual(result.format, 'unknown');
    assert.strictEqual(result.confidence, 0.5);
    assert.ok(result.details.includes('ambiguous'));
  });
});

// ── detect() with depth: 'extension' ───────────────────────────────────────

describe('GOJSONFormatDetector depth: extension', () => {
  const detector = new GOJSONFormatDetector({ depth: 'extension' });

  it('detects .json extension', async () => {
    const result = await detector.detect(fixture('array.json'));
    assert.strictEqual(result.format, 'json');
    assert.strictEqual(result.method, 'extension');
    assert.strictEqual(result.confidence, 0.7);
  });

  it('detects .jsonl extension', async () => {
    const result = await detector.detect(fixture('data.jsonl'));
    assert.strictEqual(result.format, 'jsonl');
    assert.strictEqual(result.method, 'extension');
    assert.strictEqual(result.confidence, 0.9);
  });

  it('detects .ndjson extension', async () => {
    const result = await detector.detect(fixture('data.ndjson'));
    assert.strictEqual(result.format, 'jsonl');
    assert.strictEqual(result.confidence, 0.9);
  });

  it('returns unknown for unrecognized extension', async () => {
    const result = await detector.detect(fixture('data.txt'));
    assert.strictEqual(result.format, 'unknown');
    assert.strictEqual(result.confidence, 0);
  });

  it('returns unknown for file without extension', async () => {
    const result = await detector.detect(fixture('noext'));
    assert.strictEqual(result.format, 'unknown');
    assert.ok(result.details.includes('(none)'));
  });

  it('is case-insensitive on extension', async () => {
    const result = await detector.detect(fixture('data.JSON'));
    assert.strictEqual(result.format, 'json');
  });
});

// ── detect() with depth: 'shallow' ─────────────────────────────────────────

describe('GOJSONFormatDetector depth: shallow', () => {
  const detector = new GOJSONFormatDetector({ depth: 'shallow' });

  it('returns JSONL immediately for .jsonl extension (skips byte read)', async () => {
    const result = await detector.detect(fixture('not-json-content.jsonl'));
    assert.strictEqual(result.format, 'jsonl');
    assert.strictEqual(result.method, 'extension');
    assert.strictEqual(result.confidence, 0.9);
  });

  it('detects JSON array from first byte on .json file', async () => {
    const result = await detector.detect(fixture('array.json'));
    assert.strictEqual(result.format, 'json');
    assert.strictEqual(result.method, 'shallow');
    assert.strictEqual(result.confidence, 0.85);
  });

  it('returns ambiguous for { on .json file', async () => {
    const result = await detector.detect(fixture('single-object.json'));
    assert.strictEqual(result.format, 'unknown');
    assert.strictEqual(result.method, 'shallow');
    assert.strictEqual(result.confidence, 0.5);
  });

  it('handles empty file', async () => {
    const result = await detector.detect(fixture('empty.json'));
    assert.strictEqual(result.format, 'unknown');
    assert.strictEqual(result.method, 'shallow');
    assert.strictEqual(result.confidence, 0);
  });

  it('handles file starting with whitespace then [', async () => {
    const result = await detector.detect(fixture('whitespace-then-array.json'));
    assert.strictEqual(result.format, 'json');
    assert.strictEqual(result.method, 'shallow');
  });

  it('returns unknown for unexpected first character', async () => {
    const result = await detector.detect(fixture('not-json.json'));
    assert.strictEqual(result.format, 'unknown');
    assert.strictEqual(result.confidence, 0);
    assert.ok(result.details.includes('Unexpected'));
  });
});

// ── detect() with depth: 'standard' ────────────────────────────────────────

describe('GOJSONFormatDetector depth: standard', () => {
  const detector = new GOJSONFormatDetector({ depth: 'standard' });

  it('returns JSONL immediately for .jsonl extension', async () => {
    const result = await detector.detect(fixture('data.jsonl'));
    assert.strictEqual(result.format, 'jsonl');
    assert.strictEqual(result.confidence, 0.9);
  });

  it('detects JSON array file', async () => {
    const result = await detector.detect(fixture('array.json'));
    assert.strictEqual(result.format, 'json');
    assert.strictEqual(result.confidence, 0.95);
  });

  it('detects pretty-printed JSON', async () => {
    const result = await detector.detect(fixture('pretty-object.json'));
    assert.strictEqual(result.format, 'json');
    assert.ok(result.confidence >= 0.8);
  });

  it('detects JSONL file with multiple valid JSON lines', async () => {
    const result = await detector.detect(fixture('jsonl-10.json'));
    assert.strictEqual(result.format, 'jsonl');
    assert.ok(result.confidence >= 0.9);
  });

  it('detects JSONL with fewer lines (3)', async () => {
    const result = await detector.detect(fixture('jsonl-3.json'));
    assert.strictEqual(result.format, 'jsonl');
    assert.ok(result.confidence >= 0.7);
  });

  it('handles empty file', async () => {
    const result = await detector.detect(fixture('empty.json'));
    assert.strictEqual(result.format, 'unknown');
    assert.strictEqual(result.confidence, 0);
  });

  it('handles file with only empty lines', async () => {
    const result = await detector.detect(fixture('blanks-only.json'));
    assert.strictEqual(result.format, 'unknown');
    assert.strictEqual(result.confidence, 0);
  });

  it('distinguishes pretty-printed JSON from JSONL', async () => {
    const result = await detector.detect(fixture('pretty-nested.json'));
    assert.strictEqual(result.format, 'json');
    assert.ok(result.details.includes('lines parse as JSON'));
  });

  it('respects sampleLines option', async () => {
    const detector3 = new GOJSONFormatDetector({ depth: 'standard', sampleLines: 3 });
    const result = await detector3.detect(fixture('jsonl-20.json'));
    assert.strictEqual(result.format, 'jsonl');
    assert.ok(result.details.includes('3/3'));
  });
});

// ── detect() with depth: 'deep' ────────────────────────────────────────────

describe('GOJSONFormatDetector depth: deep', () => {
  // To trigger deep sampling, standard confidence must be < 0.95.
  // Formula: confidence = min(0.95, 0.7 + (linesToTest / sampleLines) * 0.25)
  // We use sampleLines=20 with files that have fewer than 20 non-empty JSONL lines
  // but are large enough (>1KB) to trigger deep sampling via long line padding.
  const detector = new GOJSONFormatDetector({ depth: 'deep', sampleLines: 20 });

  it('confirms JSONL on large file by sampling middle and end', async () => {
    // jsonl-8-padded.json: 8 lines, each ~220 bytes = ~1.8KB
    // linesToTest = min(8, 20) = 8
    // confidence = min(0.95, 0.7 + (8/20)*0.25) = 0.8
    // File > 1KB -> deep sampling triggered, all lines are valid JSON -> confirms JSONL
    const result = await detector.detect(fixture('jsonl-8-padded.json'));
    assert.strictEqual(result.format, 'jsonl');
    assert.strictEqual(result.method, 'deep');
    assert.ok(result.confidence >= 0.8);
  });

  it('falls through to standard for small JSONL files (<1KB)', async () => {
    const result = await detector.detect(fixture('jsonl-3.json'));
    assert.strictEqual(result.format, 'jsonl');
    assert.strictEqual(result.method, 'deep');
  });

  it('returns standard result for JSON array (non-JSONL)', async () => {
    const result = await detector.detect(fixture('array.json'));
    assert.strictEqual(result.format, 'json');
  });

  it('returns standard result for pretty-printed JSON', async () => {
    const result = await detector.detect(fixture('pretty-object.json'));
    assert.strictEqual(result.format, 'json');
  });

  it('boosts confidence when deep samples confirm JSONL', async () => {
    // jsonl-8-padded.json: 8 long JSONL lines (~1.8KB)
    // Standard confidence = 0.8, deep confirms and boosts it
    const result = await detector.detect(fixture('jsonl-8-padded.json'));
    assert.strictEqual(result.format, 'jsonl');
    assert.strictEqual(result.method, 'deep');
    assert.ok(result.confidence > 0.8, `Expected confidence > 0.8, got ${result.confidence}`);
    assert.ok(result.details.includes('Confirmed JSONL'));
  });

  it('skips deep when standard already has confidence >= 0.95', async () => {
    const defaultDetector = new GOJSONFormatDetector({ depth: 'deep' });
    const result = await defaultDetector.detect(fixture('jsonl-200-padded.json'));
    assert.strictEqual(result.format, 'jsonl');
    assert.strictEqual(result.method, 'standard');
    assert.ok(result.confidence >= 0.95);
  });
});

// ── Default constructor ─────────────────────────────────────────────────────

describe('GOJSONFormatDetector constructor defaults', () => {
  it('uses standard depth by default', async () => {
    const detector = new GOJSONFormatDetector();
    const result = await detector.detect(fixture('array-small.json'));
    assert.strictEqual(result.method, 'standard');
  });

  it('uses sampleLines=10 by default', () => {
    const detector = new GOJSONFormatDetector();
    // Verify indirectly: 10 JSONL lines should yield 10/10 in details
    const lines = Array.from({ length: 15 }, (_, i) => JSON.stringify({ id: i }));
    const result = detector.detectFromContent(lines.join('\n'));
    assert.strictEqual(result.format, 'jsonl');
    assert.ok(result.details.includes('10/10'));
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('GOJSONFormatDetector edge cases', () => {
  const detector = new GOJSONFormatDetector();

  it('handles JSONL with empty lines interspersed', () => {
    const content = `{"a":1}\n\n{"b":2}\n\n{"c":3}`;
    const result = detector.detectFromContent(content);
    assert.strictEqual(result.format, 'jsonl');
  });

  it('handles JSONL with array lines', () => {
    const content = `[1,2,3]\n[4,5,6]\n[7,8,9]`;
    const result = detector.detectFromContent(content);
    // First char is [ -> detected as JSON array
    assert.strictEqual(result.format, 'json');
  });

  it('handles minified JSON array on single line', () => {
    const content = '[{"id":1},{"id":2},{"id":3}]';
    const result = detector.detectFromContent(content);
    assert.strictEqual(result.format, 'json');
    assert.ok(result.confidence >= 0.9);
  });

  it('handles large number of JSONL lines efficiently', () => {
    const lines = Array.from({ length: 10000 }, (_, i) => JSON.stringify({ i }));
    const result = detector.detectFromContent(lines.join('\n'));
    assert.strictEqual(result.format, 'jsonl');
  });

  it('handles mixed valid and invalid JSON lines as pretty-printed', () => {
    // Simulates a pretty-printed object where some inner lines happen to be valid JSON
    const content = `{
  "items": [
    {"id": 1}
  ]
}`;
    const result = detector.detectFromContent(content);
    assert.strictEqual(result.format, 'json');
  });

  it('detects NDJSON extension via file-based detect', async () => {
    const result = await detector.detect(fixture('data.ndjson'));
    assert.strictEqual(result.format, 'jsonl');
  });

  it('handles file path with dots in directory name', async () => {
    const result = await detector.detect(fixture('dotted.data.dir/file.json'));
    assert.strictEqual(result.format, 'json');
  });

  it('result always has all required fields', () => {
    const result = detector.detectFromContent('{}');
    assert.ok('format' in result);
    assert.ok('confidence' in result);
    assert.ok('method' in result);
    assert.ok('details' in result);
    assert.ok(typeof result.confidence === 'number');
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
  });
});

// ── Real-world scenarios ────────────────────────────────────────────────────

describe('GOJSONFormatDetector real-world scenarios', () => {
  const detector = new GOJSONFormatDetector({ depth: 'standard' });

  it('detects AWS CloudWatch API response as JSON', async () => {
    const result = await detector.detect(fixture('cloudwatch-response.json'));
    assert.strictEqual(result.format, 'json');
  });

  it('detects SQS messages export as JSONL', async () => {
    const result = await detector.detect(fixture('sqs-export.json'));
    assert.strictEqual(result.format, 'jsonl');
  });

  it('detects DynamoDB scan output as JSON (pretty-printed)', async () => {
    const result = await detector.detect(fixture('dynamo-scan.json'));
    assert.strictEqual(result.format, 'json');
  });

  it('returns ambiguous for single-line DynamoDB JSON (minified)', async () => {
    // A minified single-line JSON object starting with { is ambiguous
    // (could be one JSON object or one-line JSONL) -- this is expected behavior
    const result = await detector.detect(fixture('dynamo-minified.json'));
    assert.strictEqual(result.format, 'unknown');
    assert.strictEqual(result.confidence, 0.5);
  });

  it('detects log-style NDJSON file', async () => {
    const result = await detector.detect(fixture('app-logs.ndjson'));
    assert.strictEqual(result.format, 'jsonl');
  });
});
