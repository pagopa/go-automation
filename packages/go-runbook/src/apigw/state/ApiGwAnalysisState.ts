export type ApiGwQueryIdentifierMode = 'trace' | 'fallback' | 'none';

export interface ApiGwServiceVisitPlan {
  readonly queryNumber: number;
  readonly visitNumber: number;
  readonly isNewVisit: boolean;
}

export interface ApiGwCurrentQueryIdentifier {
  readonly mode: ApiGwQueryIdentifierMode;
  readonly value: string;
}

/**
 * Counter var name used to track CloudWatch query attempts across the
 * whole runbook execution. Written/read by service traversal steps and
 * displayed by the reporter.
 */
export const API_GW_QUERY_COUNTER_VAR = 'apiGwQueryCount';

/**
 * Counter var name used to track distinct service visits. A re-query on
 * the same service does not increment this counter.
 */
export const API_GW_VISIT_COUNTER_VAR = 'apiGwVisitCount';

/**
 * Name of the last service entered, persisted to detect whether the
 * current execution is a new visit or a re-query of the same service.
 */
export const API_GW_LAST_SERVICE_VAR = 'apiGwLastService';

export function planApiGwServiceVisit(vars: ReadonlyMap<string, string>, serviceName: string): ApiGwServiceVisitPlan {
  const prevCount = Number(vars.get(API_GW_QUERY_COUNTER_VAR) ?? '0');
  const queryNumber = Number.isFinite(prevCount) ? prevCount + 1 : 1;

  const lastService = vars.get(API_GW_LAST_SERVICE_VAR) ?? '';
  const isNewVisit = lastService !== serviceName;
  const prevVisits = Number(vars.get(API_GW_VISIT_COUNTER_VAR) ?? '0');
  const safeVisits = Number.isFinite(prevVisits) ? prevVisits : 0;
  const visitNumber = isNewVisit ? safeVisits + 1 : safeVisits;

  return { queryNumber, visitNumber, isNewVisit };
}

export function apiGwServiceVisitVars(
  vars: ReadonlyMap<string, string>,
  serviceName: string,
  logCount: number,
  visitPlan: ApiGwServiceVisitPlan,
  identifier: ApiGwCurrentQueryIdentifier,
): Readonly<Record<string, string>> {
  return {
    [API_GW_QUERY_COUNTER_VAR]: String(visitPlan.queryNumber),
    [API_GW_VISIT_COUNTER_VAR]: String(visitPlan.visitNumber),
    [API_GW_LAST_SERVICE_VAR]: serviceName,
    apiGwCurrentQueryIdentifierMode: identifier.mode,
    apiGwCurrentQueryIdentifierValue: identifier.value,
    apiGwServicesVisited: updateApiGwServicesVisitedChain(
      vars.get('apiGwServicesVisited'),
      serviceName,
      logCount,
      visitPlan.isNewVisit,
    ),
  };
}

/**
 * Maintains the comma-separated `name|count` chain stored in the
 * `apiGwServicesVisited` var. The reporter parses this var on
 * termination to render the closing summary.
 */
export function updateApiGwServicesVisitedChain(
  previous: string | undefined,
  serviceName: string,
  logCount: number,
  isNewVisit: boolean,
): string {
  if (previous === undefined || previous === '') {
    return `${serviceName}|${logCount}`;
  }
  if (isNewVisit) {
    return `${previous},${serviceName}|${logCount}`;
  }
  const entries = previous.split(',');
  entries[entries.length - 1] = `${serviceName}|${logCount}`;
  return entries.join(',');
}
