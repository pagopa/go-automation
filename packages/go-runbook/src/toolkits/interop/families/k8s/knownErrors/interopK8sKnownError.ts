/**
 * Shared helpers for INTEROP k8s known errors: conditions that scan the
 * application-logs query and, unless told otherwise, the CID tracker query of a
 * runbook, and log actions rendered with the runbook's INTEROP context vars.
 */
import { omitUndefined } from '@pagopa/go-common/utils';

import { knownError } from '../../../../common/analysis/knownError.js';
import type { Condition, KnownError, LogActionRow } from '../../../../../engine/index.js';
import { all, anyStepEvidenceMatches, stepEvidenceMatches, varEquals } from '../../../../../engine/index.js';
import type { InteropEnvironment } from '../../../environment/InteropEnvironment.js';
import type { InteropK8sKnownErrorConfig } from './InteropK8sKnownErrorConfig.js';
import type { InteropK8sKnownErrorRefs } from './InteropK8sKnownErrorRefs.js';

/**
 * Builds an INTEROP k8s known error.
 *
 * - The condition is `condition`, or the regex matched against the application logs and the CID tracker
 *   (`evidence: 'ANY'`, the default) or against the application logs only (`'APPLICATION_LOGS'`: the tracker
 *   spans other services).
 * - `environments` restricts the case to the INTEROP environments where it is documented.
 * - The console rows are environment, log group, service and analysed CIDs, followed by `extraDetails`; `details`
 *   replaces the standard rows when the runbook shows others.
 *
 * @param refs - Step ids and var prefix of the owning runbook
 * @param config - Known error id, condition and resolution
 * @returns The assembled known error
 * @throws Error when the case declares neither a regex nor a condition
 *
 * @example
 * ```typescript
 * interopK8sKnownError(REFS, {
 *   id: 'notifier-organization-id-not-found',
 *   description: 'Organization ID non trovato',
 *   regex: 'No organizationId found',
 *   environments: ['prod'],
 *   resolution: 'PIN-10910',
 *   proposedStatus: 'IN_PROGRESS',
 *   analysisType: 'ANALYZABLE',
 * });
 * ```
 */
export function interopK8sKnownError(refs: InteropK8sKnownErrorRefs, config: InteropK8sKnownErrorConfig): KnownError {
  return knownError({
    code: config.code,
    description: config.description,
    ...omitUndefined({ title: config.title, level: config.level, supersedes: config.supersedes }),
    condition: withEnvironments(matchCondition(refs, config), config.environments),
    resolution: config.resolution,
    details: [...(config.details ?? standardDetails(refs)), ...(config.extraDetails ?? [])],
    analysis: {
      proposedStatus: config.proposedStatus,
      analysisType: config.analysisType,
      ...omitUndefined({
        ignoreReasonCode: config.ignoreReasonCode,
        errorDetails: config.errorDetails,
        downstreams: config.downstreams,
        finalActions: config.finalActions,
        links: config.links,
      }),
    },
  });
}

/** The condition of the case: its own, or the regex on the evidence it names. */
function matchCondition(refs: InteropK8sKnownErrorRefs, config: InteropK8sKnownErrorConfig): Condition {
  if (config.condition !== undefined) return config.condition;
  if (config.regex === undefined) {
    throw new Error(`interopK8sKnownError "${config.code}": declare a regex or a condition.`);
  }
  return config.evidence === 'APPLICATION_LOGS'
    ? stepEvidenceMatches(refs.applicationLogsStepId, config.regex)
    : anyStepEvidenceMatches([refs.applicationLogsStepId, refs.cidTrackerStepId], config.regex);
}

/** The condition restricted to the environments of the case: one compared exactly, several as a list. */
function withEnvironments(
  condition: Condition,
  environments: ReadonlyArray<InteropEnvironment> | undefined,
): Condition {
  if (environments === undefined) return condition;
  const [only, ...others] = environments;
  const scope: Condition =
    only !== undefined && others.length === 0
      ? varEquals('interopEnvironment', only)
      : { type: 'contains', ref: 'vars.interopEnvironment', value: environments };
  return all(scope, condition);
}

/** The standard rows of an INTEROP k8s case, rendered with the runbook's context vars. */
function standardDetails(refs: InteropK8sKnownErrorRefs): ReadonlyArray<LogActionRow> {
  return [
    ['Ambiente', '{{vars.interopEnvironment}}'],
    ['Log group', '{{vars.interopLogGroup}}'],
    ['Servizio', '{{vars.interopPodApp}}'],
    ['CID analizzati', `{{vars.${refs.varPrefix}CidCount}}`],
  ];
}
