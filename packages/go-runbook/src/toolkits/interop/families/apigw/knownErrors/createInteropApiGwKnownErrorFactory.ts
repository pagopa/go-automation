import { omitUndefined } from '@pagopa/go-common/utils';

import { knownError } from '../../../../common/analysis/knownError.js';
import type { Condition, LogActionRow } from '../../../../../engine/index.js';
import { all, anyStepEvidenceMatches, not, stepEvidenceMatches } from '../../../../../engine/index.js';

import type { InteropEnvironment } from '../../../environment/InteropEnvironment.js';
import type { InteropApiGwKnownErrorEvidence } from './InteropApiGwKnownErrorEvidence.js';
import type { InteropApiGwKnownErrorFn } from './InteropApiGwKnownErrorFn.js';
import type { InteropApiGwKnownErrorRefs } from './InteropApiGwKnownErrorRefs.js';

/**
 * Creates a runbook-bound factory for INTEROP API Gateway known errors: the regex on the evidence of the access log,
 * of the application logs and of the CID tracker (`evidence: 'ANY'`, the default), of the access log only
 * (`'API_GATEWAY'`) or of the application logs only (`'APPLICATION_LOGS'`), without `excludeRegex`, with `guard`,
 * in `environments`.
 *
 * @param refs - Step ids, var prefix and label of the application logs of the runbook
 * @returns The factory of the known errors of the runbook
 *
 * @example
 * ```typescript
 * const knownError = createInteropApiGwKnownErrorFactory({ apiGatewayStepId, applicationLogsStepId, cidTrackerStepId, varPrefix, applicationLogsLabel });
 * knownError({ id: 'waf-timeout', description: 'Timeout del WAF', regex: 'WAF call got timed out', resolution, proposedStatus: 'COMPLETED' });
 * ```
 */
export function createInteropApiGwKnownErrorFactory(refs: InteropApiGwKnownErrorRefs): InteropApiGwKnownErrorFn {
  return (config) => {
    const baseCondition = evidenceMatches(refs, config.regex, config.evidence ?? 'ANY');
    const matchingCondition =
      config.excludeRegex === undefined
        ? baseCondition
        : all(baseCondition, not(anyEvidenceMatches(refs, config.excludeRegex)));
    const guardedCondition = config.guard === undefined ? matchingCondition : all(matchingCondition, config.guard);

    return knownError({
      code: config.code,
      description: config.description,
      condition: withEnvironment(guardedCondition, config.environments),
      resolution: config.resolution,
      details: knownErrorDetails(refs),
      analysis: {
        proposedStatus: config.proposedStatus,
        analysisType: 'ANALYZABLE',
        ...omitUndefined({
          downstreams: config.downstreams,
          resources: config.resources?.map((name) => ({ name, role: 'CASE_RELATED' as const })),
          finalActions: config.finalActions,
          links: config.links,
        }),
      },
    });
  };
}

function evidenceMatches(
  refs: InteropApiGwKnownErrorRefs,
  regex: string,
  evidence: InteropApiGwKnownErrorEvidence,
): Condition {
  switch (evidence) {
    case 'API_GATEWAY':
      return stepEvidenceMatches(refs.apiGatewayStepId, regex);
    case 'APPLICATION_LOGS':
      return stepEvidenceMatches(refs.applicationLogsStepId, regex);
    case 'ANY':
      return anyEvidenceMatches(refs, regex);
    default: {
      const exhaustive: never = evidence;
      throw new Error(`Unknown INTEROP API Gateway evidence: ${String(exhaustive)}`);
    }
  }
}

function anyEvidenceMatches(refs: InteropApiGwKnownErrorRefs, regex: string): Condition {
  return anyStepEvidenceMatches([refs.apiGatewayStepId, refs.applicationLogsStepId, refs.cidTrackerStepId], regex);
}

function withEnvironment(condition: Condition, environments: ReadonlyArray<InteropEnvironment> | undefined): Condition {
  if (environments === undefined) return condition;
  return all({ type: 'contains', ref: 'vars.interopEnvironment', value: environments }, condition);
}

function knownErrorDetails(refs: InteropApiGwKnownErrorRefs): ReadonlyArray<LogActionRow> {
  return [
    ['Ambiente', '{{vars.interopEnvironment}}'],
    ['API Gateway ID', '{{vars.interopApiGwId}}'],
    ['Servizio', '{{vars.interopPodApp}}'],
    [refs.applicationLogsLabel, `{{vars.${refs.varPrefix}LogCount}}`],
    ['CID analizzati', `{{vars.${refs.varPrefix}CidCount}}`],
  ];
}
