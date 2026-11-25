import type { DownstreamMarkerField } from '../types/DownstreamMarkerField.js';
import type { DownstreamDetectionQueryCommonOptions } from './DownstreamDetectionQueryCommonOptions.js';

/** Options for the canonical SEND downstream-detection query. */
export type DownstreamDetectionQueryOptions = DownstreamDetectionQueryCommonOptions &
  (
    | {
        /** Exact service name emitted after `[DOWNSTREAM] Service` in application logs. */
        readonly downstreamName: string;
        readonly matchAnyService?: false;
        /** HTTP status codes that must not contribute to the diagnosis. */
        readonly excludedStatusCodes?: ReadonlyArray<number>;
        /**
         * Also require the marker in the parsed `message` field, not only in the
         * raw `@message` event.
         *
         * The raw event carries the whole record, so a marker quoted inside a
         * stack trace matches it while the structured field stays clean. An
         * alarm whose metric filter reads `message` counts only the latter, and
         * a runbook that scanned both would analyse occurrences the alarm never
         * raised.
         */
        readonly matchStructuredMessage?: boolean;
        /**
         * Field that carries the marker:
         * - `'@message'` (default): the raw event, as every downstream query does today;
         * - `'message'`: **only** the structured field, with no raw `@message` predicate. For
         *   payloads too large to scan raw, and so a marker quoted in a raw stack trace never
         *   counts. The exclusions read the same field.
         *
         * Not combinable with `matchStructuredMessage`, which adds the structured predicate
         * to the raw one instead of replacing it.
         */
        readonly markerField?: DownstreamMarkerField;
      }
    | {
        /** Match the generic metric-filter contract when the alarm covers every emitted service name. */
        readonly matchAnyService: true;
        readonly downstreamName?: never;
        // Both of these describe the exact marker, which this variant does not
        // build: it matches `[DOWNSTREAM]` and `returned errors=` as separate
        // fragments and never assembles a service name. Declaring them here as
        // `never` turns passing one into a compile error rather than an option
        // that silently does nothing; the constructor rejects them at runtime
        // too, for options assembled dynamically.
        readonly excludedStatusCodes?: never;
        readonly matchStructuredMessage?: never;
        readonly markerField?: never;
      }
  );
