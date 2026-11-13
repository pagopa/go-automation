/**
 * Options of {@link interopK8sExactPodQueryProfile}: the variations of the
 * "exact pod" application-log query of the INTEROP k8s runbooks (EVO-RBREORG-OPUS-01 P30).
 */
export interface InteropK8sExactPodQueryOptions {
  /** Trace profile id of the application-log query. */
  readonly applicationLogsQueryProfileId: string;
  /**
   * Shape of the query:
   * - `error-filter` (default): the ERROR/stderr filter first, then the exact pod, the CID and a display;
   * - `fields`: the raw fields first (`pod_namespace`, `@logStream`, `stream`, `log`), for logs without
   *   the standard INTEROP prefix.
   */
  readonly form?: 'error-filter' | 'fields';
  /** Columns of the `error-filter` form: the CID (default), or also `@logStream`, `stream` and `log`. */
  readonly display?: 'cid' | 'cid-with-stream';
  /** Fixed `pod_namespace` of the `error-filter` form, when the alarm covers one environment only. */
  readonly namespace?: string;
  /** CID tracker that orders the rows by the date written in the log line, with its trace profile id. */
  readonly datedCidTracker?: { readonly queryProfileId: string };
}
