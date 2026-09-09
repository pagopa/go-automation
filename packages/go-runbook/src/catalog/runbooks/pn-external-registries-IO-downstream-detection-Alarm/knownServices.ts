import { service } from '../framework.js';

/**
 * Preserves both predicates of the documented metric filter and q1.
 * The canonical downstream helper adds chronological ordering and projects
 * trace_id plus structured/raw messages, which are needed by q2 and analysis.
 * Its exact-service variant alone does not restrict the level to ERROR.
 */
const IO_DOWNSTREAM_QUERY = `filter level = 'ERROR' and message like '[DOWNSTREAM] Service IO returned errors='
| ${service.buildDownstreamDetectionQuery({ downstreamName: 'IO' })}`;

/** Application service whose logs contain IO downstream errors. */
export const SERVICE: service.ServiceDescriptor = {
  name: 'pn-external-registries',
  varPrefix: 'externalRegistries',
  logGroup: '/aws/ecs/pn-external-registries',
  // The application emits `IO`; the analysis census identifies it as `AppIO`.
  queryOverride: IO_DOWNSTREAM_QUERY,
};
