import type { SendDownstream } from '../../analysis/downstreams/index.js';

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
    };
