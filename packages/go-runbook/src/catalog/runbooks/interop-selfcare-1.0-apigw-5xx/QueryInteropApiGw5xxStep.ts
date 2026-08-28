import type { TimeRangeFromParams } from '../../../steps/data/TimeRangeFromParams.js';
import { QueryInteropApiGwAggregatesStep } from '../../../interop/apigw/steps/QueryInteropApiGwAggregatesStep.js';

import { buildInteropApiGw5xxAggregateQuery, INTEROP_API_GW_5XX_QUERY_PROFILE_ID } from './queries.js';

export interface QueryInteropApiGw5xxStepConfig {
  readonly id: string;
  readonly label: string;
  readonly timeRangeFromParams: TimeRangeFromParams;
  readonly apiGwIdVar?: string;
  readonly logGroupVar?: string;
}

/** Backward-compatible Selfcare adapter over the shared INTEROP APIGW aggregate step. */
export class QueryInteropApiGw5xxStep extends QueryInteropApiGwAggregatesStep {
  constructor(config: QueryInteropApiGw5xxStepConfig) {
    super({
      ...config,
      queryProfileId: INTEROP_API_GW_5XX_QUERY_PROFILE_ID,
      queryKind: 'interop-api-gateway-5xx-aggregate',
      errorFamilyLabel: '5xx',
      buildQuery: buildInteropApiGw5xxAggregateQuery,
    });
  }
}
