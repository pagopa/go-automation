import type { EvidenceIdentifier } from '../../../../../engine/index.js';
import { renderQueryTemplate } from '../../../../common/queries/renderQueryTemplate.js';
import { traceIdForms } from '../../../../common/parsing/traceIds/traceIdentity.js';
import type { ServiceLogSpec } from '../profiles/ServiceLogSpec.js';

/** Placeholder of the query of a service where the filter on the identifiers goes. */
export const SERVICE_LOG_FILTER_CLAUSE = '{{FILTER_CLAUSE}}';

/**
 * The query of a read of the logs of a SEND service: one predicate per identifier, a trace id in every form the logs
 * write it (X-Ray and compact 32-hex), combined in `OR` in the `{{FILTER_CLAUSE}}` of the query.
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
  const predicates = identifiers.flatMap((identifier) => {
    const fallback = identifier.kind === 'fallbackUuid';
    const values = fallback ? [identifier.value] : traceIdForms(identifier.value);
    return values.map((value) =>
      renderQueryTemplate(fallback ? spec.fallbackPredicateTemplate : spec.tracePredicateTemplate, {
        values: { '{{VALUE}}': value },
        escape: 'sql',
        queryId: `${queryProfileId}.serviceLog.${fallback ? 'fallback' : 'trace'}Predicate`,
      }),
    );
  });
  return renderQueryTemplate(queryTemplate, {
    values: { [SERVICE_LOG_FILTER_CLAUSE]: `filter ${predicates.map((predicate) => `(${predicate})`).join(' or ')}` },
    escape: 'none',
    queryId: `${queryProfileId}.serviceLog`,
  });
}
