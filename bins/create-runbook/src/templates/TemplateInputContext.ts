/**
 * Context passed to a {@link TemplateInput} default resolver so that a
 * default can depend on the runbook id and previously collected inputs.
 */
export interface TemplateInputContext {
  /** The runbook id chosen for this scaffold. */
  readonly id: string;
  /** Inputs collected so far, keyed by input name. */
  readonly collected: ReadonlyMap<string, string>;
}
