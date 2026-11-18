/** Log evidence served by {@link interopPodResponder} to an INTEROP k8s pipeline. */
export interface InteropPodLogScenario {
  /** Pod of the alarmed service: owner of the application and context rows. */
  readonly podApp: string;
  /** Error rows returned by the application-log query. */
  readonly messages?: ReadonlyArray<string>;
  /** Rows returned by the CID tracker query. */
  readonly trackerMessages?: ReadonlyArray<string>;
  /** Pod of the tracker rows; defaults to another service. */
  readonly trackerPodApp?: string;
  /** Rows returned by the full pod context query, when the runbook has one. */
  readonly contextMessages?: ReadonlyArray<string>;
  /** CID prefixed to every application row, so the CID tracker runs. */
  readonly cid?: string;
  /** Makes the pod context query fail with AccessDenied. */
  readonly failContext?: boolean;
}
