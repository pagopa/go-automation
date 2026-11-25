import type { DownstreamCatalogs } from '../../toolkits/common/analysis/validation/DownstreamCatalogs.js';
import { INTEROP_DOWNSTREAMS } from '../../toolkits/interop/analysis/INTEROP_DOWNSTREAMS.js';
import { SEND_DOWNSTREAMS } from '../../toolkits/send/analysis/SEND_DOWNSTREAMS.js';

/** Downstream catalog of each product, injected into the registry. */
export const DOWNSTREAM_CATALOGS: DownstreamCatalogs = {
  SEND: new Set<string>(Object.values(SEND_DOWNSTREAMS)),
  INTEROP: new Set<string>(Object.values(INTEROP_DOWNSTREAMS)),
};
