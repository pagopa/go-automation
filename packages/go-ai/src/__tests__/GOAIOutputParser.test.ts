import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseGOAIJsonOutput, stripGOAIOutputFence } from '../GOAIOutputParser.js';

describe('stripGOAIOutputFence', () => {
  it('returns unfenced output unchanged apart from outer trimming', () => {
    assert.strictEqual(stripGOAIOutputFence('  {"ok":true}  '), '{"ok":true}');
  });

  it('unwraps JSON markdown fences', () => {
    assert.strictEqual(stripGOAIOutputFence('```json\n{"ok":true}\n```'), '{"ok":true}');
  });

  it('unwraps plain markdown fences', () => {
    assert.strictEqual(stripGOAIOutputFence('```\n{"ok":true}\n```'), '{"ok":true}');
  });

  it('does not use a polynomial regex on long whitespace input', () => {
    const input = `\`\`\`json\n${' '.repeat(50_000)}{"ok":true}${' '.repeat(50_000)}\n\`\`\``;

    assert.strictEqual(stripGOAIOutputFence(input), '{"ok":true}');
  });
});

describe('parseGOAIJsonOutput', () => {
  it('parses fenced JSON output', () => {
    assert.deepStrictEqual(parseGOAIJsonOutput('```json\n{"score":87}\n```'), { score: 87 });
  });
});
