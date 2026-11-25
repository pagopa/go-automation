/* Generated from the WT-owned JSON Schema. Do not edit. */

export type AnalysisDraftV1 =
  | {
      analysisType: "ANALYZABLE" | "IGNORABLE";
      conclusionNotes: string;
      /**
       * @maxItems 64
       */
      downstreams: string[];
      errorDetails?: string;
      /**
       * @maxItems 64
       */
      finalActions: string[];
      ignoreDetails?: {
        /**
         * This interface was referenced by `undefined`'s JSON-Schema definition
         * via the `patternProperty` "^(.*)$".
         */
        [k: string]: unknown;
      };
      ignoreReasonCode?: string;
      kind: "KNOWN_CASE";
      /**
       * @maxItems 64
       */
      links: {
        name?: string;
        type?: string;
        url: string;
      }[];
      proposedStatus: "IN_PROGRESS" | "COMPLETED";
      /**
       * @maxItems 64
       */
      resources: {
        name: string;
        role?: "PRIMARY" | "QUERIED" | "CASE_RELATED";
        type?: string;
      }[];
      runbookName?: string;
      schemaVersion: 1;
    }
  | {
      /**
       * @maxItems 64
       */
      downstreams: string[];
      /**
       * @maxItems 64
       */
      finalActions: string[];
      kind: "UNKNOWN_CASE_CONTEXT";
      /**
       * @maxItems 64
       */
      links: {
        name?: string;
        type?: string;
        url: string;
      }[];
      /**
       * @maxItems 64
       */
      resources: {
        name: string;
        role?: "PRIMARY" | "QUERIED" | "CASE_RELATED";
        type?: string;
      }[];
      runbookName?: string;
      schemaVersion: 1;
    };
