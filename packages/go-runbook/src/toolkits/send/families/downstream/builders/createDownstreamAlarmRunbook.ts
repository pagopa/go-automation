import type { Runbook } from '../../../../../engine/types/Runbook.js';
import { createSendServiceAlarmRunbook } from '../../service/builders/createSendServiceAlarmRunbook.js';
import { buildDownstreamDetectionQuery } from '../queries/buildDownstreamDetectionQuery.js';
import type { DownstreamAlarmConfig } from '../types/DownstreamAlarmConfig.js';
import type { DownstreamScanShape } from '../types/DownstreamScanShape.js';
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
  return createSendServiceAlarmRunbook({
    ...rest,
    service: { ...service, queryOverride: downstreamQuery(downstream) },
  });
}

/**
 * Rows a downstream scan may ask for. The service runbook reads one Logs Insights result page
 * (no pagination), so a larger limit would silently drop the rows of the later pages.
 */
const MAX_SCAN_ROWS = 10_000;

/** Options that only an exact (`named`) selector can carry. */
const NAMED_ONLY_OPTIONS: ReadonlyArray<string> = [
  'name',
  'emittedAs',
  'excludedStatusCodes',
  'errorLevelOnly',
  'matchStructuredMessage',
  'markerField',
];

/** Row limit and projection of the scan, only when the selector declares them (defaults unchanged). */
function scanShape(downstream: DownstreamSelector): DownstreamScanShape {
  if (downstream.resultLimit !== undefined && downstream.resultLimit > MAX_SCAN_ROWS) {
    throw new Error(
      `createDownstreamAlarmRunbook: resultLimit ${String(downstream.resultLimit)} exceeds ${String(MAX_SCAN_ROWS)}, ` +
        'the rows of one Logs Insights result page: the service scan does not paginate.',
    );
  }
  return {
    ...(downstream.resultLimit === undefined ? {} : { resultLimit: downstream.resultLimit }),
    ...(downstream.projection === undefined ? {} : { projection: downstream.projection }),
  };
}

function downstreamQuery(downstream: DownstreamSelector): string {
  switch (downstream.kind) {
    case 'any': {
      // A selector built dynamically can carry exact-marker options the type forbids:
      // dropping them silently would scan something other than what was declared.
      const declared = downstream as Readonly<Record<string, unknown>>;
      const misplaced = NAMED_ONLY_OPTIONS.filter((option) => declared[option] !== undefined);
      if (misplaced.length > 0) {
        throw new Error(`createDownstreamAlarmRunbook: ${misplaced.join(', ')} require a 'named' downstream selector.`);
      }
      return buildDownstreamDetectionQuery({ matchAnyService: true, ...scanShape(downstream) });
    }
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
        ...(downstream.markerField === undefined ? {} : { markerField: downstream.markerField }),
        ...scanShape(downstream),
      });
    default: {
      // A third case added to the type breaks here, not at runtime.
      const unhandled: never = downstream;
      throw new Error(`Unhandled downstream selector: ${JSON.stringify(unhandled)}`);
    }
  }
}
