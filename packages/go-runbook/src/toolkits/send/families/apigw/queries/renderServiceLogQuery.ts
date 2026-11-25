import type { EvidenceIdentifier } from '../../../../../engine/index.js';
import { renderQueryTemplate } from '../../../../common/queries/renderQueryTemplate.js';
import { traceIdForms } from '../../../../common/parsing/traceIds/traceIdentity.js';
import { traceIdsInsightsPattern } from '../../../../common/queries/insightsRegex.js';
import type { ServiceLogSpec } from '../profiles/ServiceLogSpec.js';

/** Placeholder of the query of a service where the filter on the identifiers goes. */
export const SERVICE_LOG_FILTER_CLAUSE = '{{FILTER_CLAUSE}}';

/**
 * The query of a read of the logs of a SEND service: the trace ids in every form the logs write them (X-Ray and
 * compact 32-hex), with one regex for the whole batch when the profile declares `tracePatternTemplate` and one
 * predicate per form otherwise, and one predicate per fallback UUID, combined in `OR` in the `{{FILTER_CLAUSE}}`.
 *
 * @param spec - Service logs of the profile: predicates of the identifiers and default query
 * @param queryProfileId - Profile of the query, for the errors of the templates
 * @param identifiers - Identifiers of the read, at least one
 * @param queryTemplate - Query of the service, with the `{{FILTER_CLAUSE}}` placeholder
 * @returns The query
 *
 * @example
 * ```typescript
 * renderServiceLogQuery(SEND_API_GW_PROFILE.serviceLog, 'send', [{ kind: 'fallbackUuid', value: 'uuid-1' }]);
 * ```
 */
export function renderServiceLogQuery(
  spec: ServiceLogSpec,
  queryProfileId: string,
  identifiers: ReadonlyArray<EvidenceIdentifier>,
  queryTemplate: string = spec.queryTemplate,
): string {
  const traceIds = identifiers.filter(({ kind }) => kind !== 'fallbackUuid').map(({ value }) => value);
  const pattern = spec.tracePatternTemplate;
  const tracePredicates =
    pattern !== undefined && traceIds.length > 0
      ? [
          renderQueryTemplate(pattern, {
            values: { '{{PATTERN}}': traceIdsInsightsPattern(traceIds) },
            escape: 'none',
            queryId: `${queryProfileId}.serviceLog.tracePattern`,
          }),
        ]
      : traceIds.flatMap((traceId) =>
          traceIdForms(traceId).map((value) =>
            predicate(spec.tracePredicateTemplate, value, `${queryProfileId}.serviceLog.tracePredicate`),
          ),
        );
  const fallbackPredicates = identifiers
    .filter(({ kind }) => kind === 'fallbackUuid')
    .map(({ value }) =>
      predicate(spec.fallbackPredicateTemplate, value, `${queryProfileId}.serviceLog.fallbackPredicate`),
    );
  const predicates = [...tracePredicates, ...fallbackPredicates];
  return renderQueryTemplate(queryTemplate, {
    values: { [SERVICE_LOG_FILTER_CLAUSE]: `filter ${predicates.map((predicate) => `(${predicate})`).join(' or ')}` },
    escape: 'none',
    queryId: `${queryProfileId}.serviceLog`,
  });
}

/** The predicate of one value, escaped as a SQL string. */
function predicate(template: string, value: string, queryId: string): string {
  return renderQueryTemplate(template, {
    values: { '{{VALUE}}': value },
    escape: 'sql',
    queryId,
  });
}
