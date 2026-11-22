import type { TraceIdFormat } from './TraceIdFormat.js';

/** A direct tracing id recognized by one of the known formats. */
export interface TraceIdFormatMatch {
  readonly format: TraceIdFormat;
  readonly canonical: string;
}
