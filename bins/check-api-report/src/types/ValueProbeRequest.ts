/** The exports of one entrypoint to classify. */
export interface ValueProbeRequest {
  /** Compiled `.d.ts` of the entrypoint. */
  readonly typesFile: string;
  /** Qualified export names, e.g. `answer`, `apigw`, `apigw.ParseApiGwErrorsStep`. */
  readonly names: ReadonlyArray<string>;
}
