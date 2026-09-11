import type { Runbook } from '../../types/Runbook.js';
import { createServiceAlarmRunbook } from '../../service/builders/createServiceAlarmRunbook.js';
import { buildDownstreamDetectionQuery } from '../../service/queries/buildDownstreamDetectionQuery.js';
import type { DownstreamAlarmConfig } from '../types/DownstreamAlarmConfig.js';
import type { DownstreamSelector } from '../types/DownstreamSelector.js';

/**
 * Builds a runbook that diagnoses an alarm raised by a downstream failure.
 *
 * A downstream runbook is a service runbook whose first scan looks for the
 * `[DOWNSTREAM] Service … returned errors=` markers instead of every error
 * line. The query belongs to this toolkit, so a runbook declares which
 * downstream it watches and never spells the query out.
 *
 * @param config - Service, downstream and known cases of the runbook
 * @returns A validated {@link Runbook} ready for execution
 * @throws Error when the selector is inconsistent, e.g. excluded status codes
 *         without an exact downstream name
 *
 * @example
 * ```typescript
 * createDownstreamAlarmRunbook({
 *   id: 'pn-national-registries-INAD-downstream-detection-Alarm',
 *   metadata: { ... },
 *   service: { name: 'pn-national-registries', varPrefix: 'nationalRegistries', logGroup: '/aws/ecs/pn-national-registries' },
 *   downstream: { kind: 'named', name: SEND_DOWNSTREAMS.INAD, excludedStatusCodes: [404] },
 *   knownCases: KNOWN_CASES,
 * });
 * ```
 */
export function createDownstreamAlarmRunbook(config: DownstreamAlarmConfig): Runbook {
  const { downstream, service, ...rest } = config;
  return createServiceAlarmRunbook({
    ...rest,
    service: { ...service, queryOverride: downstreamQuery(downstream) },
  });
}

function downstreamQuery(downstream: DownstreamSelector): string {
  switch (downstream.kind) {
    case 'any':
      return buildDownstreamDetectionQuery({ matchAnyService: true });
    case 'named':
      // `emittedAs` wins for the query: the log only ever contains what the
      // application writes, while the census name is what the analysis reports.
      return buildDownstreamDetectionQuery({
        downstreamName: downstream.emittedAs ?? downstream.name,
        ...(downstream.excludedStatusCodes === undefined
          ? {}
          : { excludedStatusCodes: [...downstream.excludedStatusCodes] }),
        ...(downstream.errorLevelOnly === undefined ? {} : { errorLevelOnly: downstream.errorLevelOnly }),
        ...(downstream.matchStructuredMessage === undefined
          ? {}
          : { matchStructuredMessage: downstream.matchStructuredMessage }),
      });
    default: {
      // A third case added to the type breaks here, not at runtime.
      const unhandled: never = downstream;
      throw new Error(`Unhandled downstream selector: ${JSON.stringify(unhandled)}`);
    }
  }
}
