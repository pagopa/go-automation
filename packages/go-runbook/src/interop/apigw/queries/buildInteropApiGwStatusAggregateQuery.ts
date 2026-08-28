export type InteropApiGwStatusClass = 4 | 5;

/** Builds the common aggregate query for one API Gateway HTTP status family. */
export function buildInteropApiGwStatusAggregateQuery(apiGwId: string, statusClass: InteropApiGwStatusClass): string {
  const lowerBound = statusClass * 100;
  const upperBound = lowerBound + 100;
  const escapedApiGwId = escapeLogsInsightsString(apiGwId);
  return `
filter apigwId = "${escapedApiGwId}"
| filter status >= ${lowerBound} and status < ${upperBound}
| stats count(*) as count, latest(@timestamp) as latestTimestamp
  by status, integrationStatus, integrationError, httpMethod, requestPath, sourceIp
| display latestTimestamp, count, status, integrationStatus, integrationError, httpMethod, requestPath, sourceIp
| sort count desc
| limit 10000
`.trim();
}

function escapeLogsInsightsString(value: string): string {
  return value.replace(/\0/g, '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
