import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';

import { GOJSONStreamWriter } from '../GOJSONStreamWriter.js';

interface RecordingSink {
  readonly stream: Writable;
  readonly chunks: string[];
  readonly stats: { maxBuffered: number };
}

/** A stream that keeps what it receives; `delay` makes it slow, `failAt` makes it fail on that write. */
function sink(
  options: { readonly delay?: boolean; readonly failAt?: number; readonly highWaterMark?: number } = {},
): RecordingSink {
  const chunks: string[] = [];
  const stats = { maxBuffered: 0 };
  let writes = 0;
  const stream: Writable = new Writable({
    decodeStrings: false,
    ...(options.highWaterMark === undefined ? {} : { highWaterMark: options.highWaterMark }),
    write(chunk: string, _encoding, callback): void {
      stats.maxBuffered = Math.max(stats.maxBuffered, stream.writableLength);
      writes += 1;
      if (options.failAt !== undefined && writes >= options.failAt) {
        callback(new Error('disk full'));
        return;
      }
      chunks.push(chunk);
      if (options.delay === true) setImmediate(callback);
      else callback();
    },
  });
  return { stream, chunks, stats };
}

const ROWS = Array.from({ length: 3000 }, (_, index) => ({ index, text: 'x'.repeat(1000) }));

describe('GOJSONStreamWriter', () => {
  it('writes exactly what JSON.stringify writes, for every kind of value and indentation', async () => {
    const value = {
      text: 'àé "quoted" \n line',
      numbers: [0, -1.5, Number.NaN, Number.POSITIVE_INFINITY],
      flags: [true, false, null],
      omitted: undefined,
      fn: () => 1,
      sparse: [undefined, () => 2, Symbol('s')],
      date: new Date('2026-01-01T00:00:00.000Z'),
      custom: { toJSON: (key: string) => `custom:${key}` },
      boxed: [Object(1) as unknown, Object('s') as unknown, Object(false) as unknown],
      empty: { object: {}, array: [] as unknown[], map: new Map([['k', 1]]) },
      nested: { deep: { deeper: [{ a: 1 }, [2, [3]]] } },
      shared: [ROWS[0], ROWS[0]],
    };
    for (const indent of [undefined, 0, 2, 4, 12]) {
      for (const input of [value, 'text', 42, null, [], {}]) {
        const { stream, chunks } = sink();
        await new GOJSONStreamWriter(indent === undefined ? {} : { indent }).write(input, stream);
        assert.strictEqual(chunks.join(''), JSON.stringify(input, null, indent), `indent ${String(indent)}`);
      }
    }
  });

  it('waits for a slow stream instead of buffering the whole text, and leaves it open', async () => {
    const { stream, chunks, stats } = sink({ delay: true, highWaterMark: 1024 });
    await new GOJSONStreamWriter({ indent: 2 }).write({ rows: ROWS }, stream);

    assert.strictEqual(chunks.join(''), JSON.stringify({ rows: ROWS }, null, 2));
    assert.ok(stats.maxBuffered < 200_000, `buffered ${String(stats.maxBuffered)}`);
    assert.strictEqual(stream.writableEnded, false);
  });

  it('rejects with the error of the stream', async () => {
    const { stream } = sink({ failAt: 2 });
    await assert.rejects(new GOJSONStreamWriter().write({ rows: ROWS }, stream), /disk full/);
  });

  it('rejects a value without a JSON form, a circular structure and a BigInt', async () => {
    const circular: Record<string, unknown> = { name: 'loop' };
    circular['self'] = circular;
    for (const value of [undefined, () => 1, circular, { big: 1n }]) {
      await assert.rejects(new GOJSONStreamWriter().write(value, sink().stream), TypeError);
    }
  });
});
