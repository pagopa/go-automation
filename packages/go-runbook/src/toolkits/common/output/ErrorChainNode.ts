/** A node of an error chain: one error at one level, with the known cases that recognize it. */
export interface ErrorChainNode {
  /** 0 = root. */
  readonly level: number;
  /** Where the error was found: a service, a log group, or `window` for a window-level runbook. */
  readonly target: string;
  /** Short description of the error. */
  readonly label: string;
  /** Descriptions of the cases that recognize the node, when they differ from the label. */
  readonly description?: string;
  /** Known cases that recognize the node; empty for an unrecognized node («?»). */
  readonly caseIds: ReadonlyArray<string>;
  readonly status: 'recognized' | 'unrecognized' | 'failed';
}
