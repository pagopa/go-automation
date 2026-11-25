/** Where a node of a SEND API Gateway runbook descends. */
export interface DescendToServiceConfig {
  readonly id: string;
  readonly label: string;
  /** A request of the root level descends to the entry service. */
  readonly entryService?: string;
  /** A service node descends to the known URL its row calls: its service and variable prefix. */
  readonly service?: { readonly name: string; readonly varPrefix: string };
  /** Services the runbook can read. */
  readonly servicesInRunbook: ReadonlySet<string>;
  /** Variable with the trace id the chain follows. */
  readonly traceIdContextVar: string;
}
