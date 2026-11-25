import { toError } from '@pagopa/go-common/errors';
import { GOJSONListExporter, type GOListExporterStreamWriter } from '@pagopa/go-common/exporters';
import { GOJSONListImporter } from '@pagopa/go-common/importers';

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

  private constructor(private readonly writer: GOListExporterStreamWriter<JournalEntry>) {}

  /**
   * Creates a new journal segment.
   *
   * @param path - Path of the segment, inside a directory from GOPaths
   * @returns The open journal
   */
  public static async open(path: string): Promise<Journal> {
    const exporter = new GOJSONListExporter<JournalEntry>({ outputPath: path, jsonl: true });
    return new Journal(await exporter.exportStream());
  }

  /**
   * Streams the entries of journal segments, in order: memory never holds
   * more than one entry, whatever the size of the journal. A truncated last
   * line (crash mid-write) is skipped: that entry was never acknowledged.
   *
   * @param paths - Segments, oldest first
   * @returns Entries in write order
   */
  public static async *entries(paths: ReadonlyArray<string>): AsyncGenerator<JournalEntry, void, undefined> {
    for (const segment of paths) {
      const importer = new GOJSONListImporter<JournalEntry>({ jsonl: true, skipInvalidItems: true });
      yield* importer.importStream(segment);
    }
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
      this.failure ??= toError(error);
    });
    return write;
  }

  /** Waits for pending writes, then closes the segment. */
  public async close(): Promise<void> {
    await this.chain;
    await this.writer.close();
  }
}
