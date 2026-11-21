/**
 * How a read ended, from the most complete to the most severe: `queried` (complete), `saturated`, `unavailable`,
 * `skipped`, `cycle`. A read with several gaps has the state of the most severe; `cycle` is only a descent never read
 * because it would repeat its chain. An absence (a count of zero) is evidence only when the read was `queried`.
 */
export type ReadState = 'queried' | 'saturated' | 'unavailable' | 'skipped' | 'cycle';
