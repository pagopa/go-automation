import type { SendDownstream } from '../../../analysis/SEND_DOWNSTREAMS.js';
import type { DownstreamMarkerField } from './DownstreamMarkerField.js';

/**
 * Which downstream failures the runbook looks for in the service logs.
 *
 * The census name and the name the application emits are separate fields
 * because they do not always agree: `pn-external-registries` writes
 * `[DOWNSTREAM] Service IO`, while the Watchtower census calls the same
 * downstream `AppIO`. Keeping both makes the mismatch a declaration instead of
 * a hand-written query, and lets the census name stay checkable against the
 * catalog while the query keeps matching what the log really contains.
 */
export type DownstreamSelector =
  | {
      /**
       * Match every downstream the service emits.
       *
       * For alarms whose metric filter already covers all of them, where
       * narrowing to one name would drop occurrences the alarm counted.
       */
      readonly kind: 'any';
      // Options of an exact marker, which this variant never builds: declared `never` so that
      // passing one is a compile error, and rejected at runtime for selectors built dynamically.
      readonly name?: never;
      readonly emittedAs?: never;
      readonly excludedStatusCodes?: never;
      readonly errorLevelOnly?: never;
      readonly matchStructuredMessage?: never;
      readonly markerField?: never;
      /** Row limit of the scan; default 1000, at most 10,000 (one result page). */
      readonly resultLimit?: number;
      /** Fields the scan selects; default `@timestamp, level, trace_id, message, @message`. */
      readonly projection?: ReadonlyArray<string>;
    }
  | {
      readonly kind: 'named';
      /** Census name, also the value the known cases annotate. */
      readonly name: SendDownstream;
      /** What the application actually writes, when it differs from {@link name}. */
      readonly emittedAs?: string;
      /** Status codes that must not count as a failure of this downstream. */
      readonly excludedStatusCodes?: ReadonlyArray<number>;
      /**
       * Also require `level = 'ERROR'`, matching a metric filter that carries
       * that predicate. Off by default: the marker alone already identifies a
       * downstream failure.
       */
      readonly errorLevelOnly?: boolean;
      /**
       * Also require the marker in the parsed `message` field, not only in the
       * raw event. For alarms whose metric filter reads that field.
       */
      readonly matchStructuredMessage?: boolean;
      /**
       * Field searched for the marker: the raw `@message` (default) or **only** the structured
       * `message`, with no raw predicate. Not combinable with {@link matchStructuredMessage}.
       */
      readonly markerField?: DownstreamMarkerField;
      /** Row limit of the scan; default 1000, at most 10,000 (one result page). */
      readonly resultLimit?: number;
      /**
       * Fields the scan selects; default `@timestamp, level, trace_id, message, @message`.
       * Leave out `@message` when raw events are too large to return.
       */
      readonly projection?: ReadonlyArray<string>;
    };
