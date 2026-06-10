import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOOrderedListExporterStreamWriter } from '../GOOrderedListExporterStreamWriter.js';
import type { GOListExporterStreamWriter } from '../GOListExporterStreamWriter.js';

interface FakeWriterOptions {
  readonly appendDelayMs?: number;
  readonly failOn?: string;
}

class FakeStreamWriter implements GOListExporterStreamWriter<string> {
  readonly written: string[] = [];
  closeCalls = 0;
  private appendsInFlight = 0;
  interleaved = false;

  constructor(private readonly options: FakeWriterOptions = {}) {}

  async append(item: string): Promise<void> {
    this.appendsInFlight += 1;
    if (this.appendsInFlight > 1) {
      this.interleaved = true;
    }
    try {
      if (this.options.appendDelayMs !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, this.options.appendDelayMs));
      }
      if (this.options.failOn === item) {
        throw new Error(`write failed for ${item}`);
      }
      this.written.push(item);
    } finally {
      this.appendsInFlight -= 1;
    }
  }

  async close(): Promise<void> {
    await Promise.resolve();
    this.closeCalls += 1;
  }
}

describe('GOOrderedListExporterStreamWriter', () => {
  it('passes through in-order appends immediately', async () => {
    const fake = new FakeStreamWriter();
    const ordered = new GOOrderedListExporterStreamWriter(fake);

    await ordered.append(0, 'a');
    assert.deepStrictEqual(fake.written, ['a']);
    await ordered.append(1, 'b');
    assert.deepStrictEqual(fake.written, ['a', 'b']);

    await ordered.close();
    assert.strictEqual(fake.closeCalls, 1);
  });

  it('reorders out-of-order appends to ascending index order', async () => {
    const fake = new FakeStreamWriter();
    const ordered = new GOOrderedListExporterStreamWriter(fake);

    await ordered.append(2, 'c');
    await ordered.append(0, 'a');
    assert.deepStrictEqual(fake.written, ['a']);
    await ordered.append(1, 'b');
    assert.deepStrictEqual(fake.written, ['a', 'b', 'c']);

    await ordered.close();
  });

  it('serializes underlying writes from concurrent appends', async () => {
    const fake = new FakeStreamWriter({ appendDelayMs: 2 });
    const ordered = new GOOrderedListExporterStreamWriter(fake);

    await Promise.all([ordered.append(1, 'b'), ordered.append(0, 'a'), ordered.append(2, 'c')]);
    await ordered.close();

    assert.deepStrictEqual(fake.written, ['a', 'b', 'c']);
    assert.strictEqual(fake.interleaved, false, 'underlying append calls must not interleave');
  });

  it('flushes remaining buffered items in order on close, tolerating gaps', async () => {
    const fake = new FakeStreamWriter();
    const ordered = new GOOrderedListExporterStreamWriter(fake);

    await ordered.append(0, 'a');
    await ordered.append(3, 'd');
    await ordered.append(2, 'c');
    assert.deepStrictEqual(fake.written, ['a']);

    await ordered.close();
    assert.deepStrictEqual(fake.written, ['a', 'c', 'd']);
    assert.strictEqual(fake.closeCalls, 1);
  });

  it('rejects duplicate or already-written indices', async () => {
    const fake = new FakeStreamWriter();
    const ordered = new GOOrderedListExporterStreamWriter(fake);

    await ordered.append(0, 'a');
    await assert.rejects(ordered.append(0, 'again'), /duplicate index 0/);

    await ordered.append(2, 'c');
    await assert.rejects(ordered.append(2, 'again'), /duplicate index 2/);

    await assert.rejects(ordered.append(-1, 'x'), /non-negative integer/);
    await ordered.close();
  });

  it('propagates an underlying write error to subsequent append and close calls', async () => {
    const fake = new FakeStreamWriter({ failOn: 'b' });
    const ordered = new GOOrderedListExporterStreamWriter(fake);

    await ordered.append(0, 'a');
    await assert.rejects(ordered.append(1, 'b'), /write failed for b/);
    await assert.rejects(ordered.append(2, 'c'), /write failed for b/);
    await assert.rejects(ordered.close(), /write failed for b/);
    assert.deepStrictEqual(fake.written, ['a']);
    assert.strictEqual(fake.closeCalls, 1, 'underlying writer must be closed even after a write error');
  });

  it('rejects appends after close', async () => {
    const fake = new FakeStreamWriter();
    const ordered = new GOOrderedListExporterStreamWriter(fake);

    await ordered.append(0, 'a');
    await ordered.close();
    await assert.rejects(ordered.append(1, 'b'), /writer is closed/);
    assert.strictEqual(fake.closeCalls, 1);
  });
});
