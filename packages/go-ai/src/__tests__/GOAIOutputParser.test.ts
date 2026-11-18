import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseGOAIJsonOutput, stripGOAIOutputFence } from '../GOAIOutputParser.js';

describe('stripGOAIOutputFence', () => {
  it('trims unfenced output and unwraps JSON and plain markdown fences', () => {
    for (const input of ['  {"ok":true}  ', '```json\n{"ok":true}\n```', '```\n{"ok":true}\n```']) {
      assert.strictEqual(stripGOAIOutputFence(input), '{"ok":true}', input);
    }
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
