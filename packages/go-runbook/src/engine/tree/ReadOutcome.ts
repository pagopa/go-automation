import type { ReadBatch } from '../reads/ReadBatch.js';

/** Rows read for one identifier, with the batch that read them. */
export interface ReadOutcome {
  readonly rows: ReadonlyArray<unknown>;
  readonly batch: ReadBatch;
}
