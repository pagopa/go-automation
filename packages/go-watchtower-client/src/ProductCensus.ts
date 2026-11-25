import type { AlarmDto, DownstreamDto, FinalActionDto, ResourceDto, RunbookDto } from './WatchtowerTypes.js';

/**
 * Snapshot of the Watchtower taxonomies owned by a single product.
 *
 * Transport-level aggregate with no runbook policy: consumers decide what counts
 * as a coverage error. Ignore reasons are global and therefore not part of it —
 * callers read them with `listIgnoreReasons()`.
 */
export interface ProductCensus {
  readonly productId: string;
  readonly alarms: ReadonlyArray<AlarmDto>;
  readonly resources: ReadonlyArray<ResourceDto>;
  readonly downstreams: ReadonlyArray<DownstreamDto>;
  readonly finalActions: ReadonlyArray<FinalActionDto>;
  readonly runbooks: ReadonlyArray<RunbookDto>;
}
