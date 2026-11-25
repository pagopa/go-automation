/**
 * Ordered stream writer for list exporters
 */

import { valueToString } from '../utils/GOValueToString.js';
import type { GOListExporterStreamWriter } from './GOListExporterStreamWriter.js';

/**
 * Decorator over a {@link GOListExporterStreamWriter} that writes items in
 * ascending index order regardless of the order in which they are appended.
 *
 * Designed for concurrent producers (e.g. a worker pool) that complete items
 * out of order but need the output file to preserve the input order. Items
 * appended ahead of their turn are buffered in memory until all predecessors
 * have been written, so memory usage stays bounded by the producer
 * concurrency as long as indices are contiguous.
 *
 * Underlying writes are serialized through an internal promise chain, so it
 * is safe to call `append()` from synchronous contexts (e.g. event handlers)
 * without awaiting previous calls. The first underlying write error is
 * captured and rethrown by every subsequent `append()`/`close()` call.
 *
 * @template TItem - The type of items to export
 *
 * @example
 * ```typescript
 * const writer = await exporter.exportStream();
 * const ordered = new GOOrderedListExporterStreamWriter(writer);
 *
 * await pool.runEach(indexedItems, async ({ index, item }) => {
 *   const result = await process(item);
 *   await ordered.append(index, result);
 * });
 *
 * await ordered.close();
 * ```
 */
export class GOOrderedListExporterStreamWriter<TItem> {
  /** Next index expected to be written to the underlying writer */
  private nextIndex = 0;

  /** Out-of-order items waiting for their predecessors */
  private readonly buffered = new Map<number, { readonly item: TItem }>();

  /** Serializes underlying writes so appends never interleave */
  private writeChain: Promise<void> = Promise.resolve();

  /** First underlying write error, rethrown on subsequent calls */
  private writeError: unknown;

  private closed = false;

  constructor(private readonly writer: GOListExporterStreamWriter<TItem>) {}

  /**
   * Append an item at a specific position in the output order
   *
   * If `index` is the next expected one, the item (and any consecutive
   * buffered successors) is written immediately; otherwise it is buffered
   * until its turn. The returned promise resolves when every item flushed
   * by this call has been written (immediately, for buffered items).
   *
   * @param index - Zero-based position of the item in the output order
   * @param item - The item to append
   * @returns Promise that resolves when the triggered writes complete
   * @throws Error if the index was already written or appended, or if the
   *   writer is closed
   */
  async append(index: number, item: TItem): Promise<void> {
    this.assertWritable();

    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`GOOrderedListExporterStreamWriter: index must be a non-negative integer (got ${index})`);
    }
    if (index < this.nextIndex || this.buffered.has(index)) {
      throw new Error(`GOOrderedListExporterStreamWriter: duplicate index ${index}`);
    }

    this.buffered.set(index, { item });
    await this.flushReady();
  }

  /**
   * Flush any remaining buffered items in ascending index order and close
   * the underlying writer
   *
   * Remaining items are flushed even if their indices are not contiguous
   * (gaps can occur when a producer stops early): output completeness for
   * processed items wins over strict gap checking.
   *
   * @returns Promise that resolves when the underlying writer is closed
   */
  async close(): Promise<void> {
    if (this.closed) {
      this.rethrowWriteError();
      return;
    }
    this.closed = true;

    // Flush leftovers in ascending order, tolerating index gaps
    const remaining = Array.from(this.buffered.keys()).sort((a, b) => a - b);
    for (const index of remaining) {
      const entry = this.buffered.get(index);
      if (entry === undefined) {
        throw new Error(`GOOrderedListExporterStreamWriter: buffered index ${index} disappeared`);
      }
      this.buffered.delete(index);
      this.enqueueWrite(entry.item);
    }

    await this.writeChain;

    // Close the underlying writer even after a write error, so resources
    // (file handles) are always released; the first error still rejects
    try {
      await this.writer.close();
    } catch (error) {
      if (this.writeError === undefined) {
        this.writeError = error;
      }
    }
    this.rethrowWriteError();
  }

  /**
   * Flushes the contiguous run of buffered items starting at `nextIndex`
   */
  private async flushReady(): Promise<void> {
    let entry = this.buffered.get(this.nextIndex);
    while (entry !== undefined) {
      this.buffered.delete(this.nextIndex);
      this.nextIndex += 1;
      this.enqueueWrite(entry.item);
      entry = this.buffered.get(this.nextIndex);
    }
    await this.writeChain;
    this.rethrowWriteError();
  }

  /**
   * Appends a write to the serialized chain, capturing the first error
   */
  private enqueueWrite(item: TItem): void {
    this.writeChain = this.writeChain.then(async () => {
      if (this.writeError !== undefined) return;
      try {
        await this.writer.append(item);
      } catch (error) {
        this.writeError = error;
      }
    });
  }

  private assertWritable(): void {
    if (this.closed) {
      throw new Error('GOOrderedListExporterStreamWriter: writer is closed');
    }
    this.rethrowWriteError();
  }

  private rethrowWriteError(): void {
    if (this.writeError !== undefined) {
      throw this.writeError instanceof Error
        ? this.writeError
        : new Error(`GOOrderedListExporterStreamWriter: write failed: ${valueToString(this.writeError)}`);
    }
  }
}
