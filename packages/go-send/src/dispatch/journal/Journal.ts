import { GOJSONListExporter, GOJSONListImporter } from '@go-automation/go-common/core';
import type { GOListExporterStreamWriter } from '@go-automation/go-common/core';

import type { JournalEntry } from './JournalEntry.js';
import type { JournalSink } from './JournalSink.js';

/**
 * Append-only JSONL journal of a run (§11.2), one segment per session.
 *
 * Every session (first run, each resume) writes its own segment with
 * `GOJSONListExporter` in JSONL mode; `run.json` lists the segments, and a
 * resume replays them in order with `GOJSONListImporter`. Writes are
 * serialized on one promise chain, so entries never interleave.
 *
 * Durability: an entry may still be in the stream buffer when the process is
 * killed. That is safe by construction: the idempotency keys are
 * deterministic, so a row whose `SENDING` was lost is sent again with the
 * same keys and SEND rejects the duplicate (409), which leads to the lookup.
 */
export class Journal implements JournalSink {
  private chain: Promise<void> = Promise.resolve();
  private failure: Error | undefined = undefined;

  private constructor(
    private readonly writer: GOListExporterStreamWriter<JournalEntry>,
    public readonly path: string,
  ) {}

  /**
   * Creates a new journal segment.
   *
   * @param path - Path of the segment, inside a directory from GOPaths
   * @returns The open journal
   */
  public static async open(path: string): Promise<Journal> {
    const exporter = new GOJSONListExporter<JournalEntry>({ outputPath: path, jsonl: true });
    return new Journal(await exporter.exportStream(), path);
  }

  /**
   * Reads the entries of journal segments, in order. A truncated last line
   * (crash mid-write) is skipped: that entry was never acknowledged.
   *
   * @param paths - Segments, oldest first
   * @returns Entries in write order
   */
  public static async read(paths: ReadonlyArray<string>): Promise<ReadonlyArray<JournalEntry>> {
    const entries: JournalEntry[] = [];
    for (const segment of paths) {
      const importer = new GOJSONListImporter<JournalEntry>({ jsonl: true, skipInvalidItems: true });
      for await (const entry of importer.importStream(segment)) entries.push(entry);
    }
    return entries;
  }

  /**
   * Appends an entry. A write failure is sticky: every later call rejects.
   *
   * @param entry - Entry to append
   */
  public async append(entry: JournalEntry): Promise<void> {
    const write = this.chain.then(async () => {
      if (this.failure !== undefined) throw this.failure;
      await this.writer.append(entry);
    });
    this.chain = write.catch((error: unknown) => {
      this.failure ??= error instanceof Error ? error : new Error(String(error));
    });
    return write;
  }

  /** Waits for pending writes, then closes the segment. */
  public async close(): Promise<void> {
    await this.chain;
    await this.writer.close();
  }
}
