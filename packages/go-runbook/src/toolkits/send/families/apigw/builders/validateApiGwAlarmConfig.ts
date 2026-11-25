import type { ApiGwAlarmConfig } from '../types/ApiGwAlarmConfig.js';
import type { ApiGwQueryProfile } from '../profiles/ApiGwQueryProfile.js';
import { renderQueryTemplate } from '../../../../common/queries/renderQueryTemplate.js';
import {
  assertStepDescriptorIds,
  failAlarmConfig,
  type AlarmConfigValidationContext,
} from '../../../../common/builders/alarmConfigValidation.js';
import { getEffectiveExecutionLogGroup, isExecutionLogEnabled } from './executionLogEnablement.js';
import { SEND_API_GW_STEP_IDS as STEP_IDS } from './SEND_API_GW_STEP_IDS.js';

/**
 * Dry-run di `renderQueryTemplate` su tutti i template del profilo
 * con valori dummy, per verificare la presenza dei placeholder
 * obbligatori. Fail-fast a build time invece che a runtime sulla prima
 * esecuzione del runbook.
 */
function validatePlaceholders(profile: ApiGwQueryProfile): void {
  renderQueryTemplate(profile.accessLog.query, {
    values: { '{{minStatusCode}}': '500' },
    queryId: `${profile.id}.accessLog`,
  });
  renderQueryTemplate(profile.serviceLog.queryTemplate, {
    values: { '{{FILTER_CLAUSE}}': '' },
    queryId: `${profile.id}.serviceLog`,
  });
  renderQueryTemplate(profile.serviceLog.tracePredicateTemplate, {
    values: { '{{VALUE}}': '' },
    queryId: `${profile.id}.serviceLog.tracePredicate`,
  });
  if (profile.serviceLog.tracePatternTemplate !== undefined) {
    renderQueryTemplate(profile.serviceLog.tracePatternTemplate, {
      values: { '{{PATTERN}}': '' },
      queryId: `${profile.id}.serviceLog.tracePattern`,
    });
  }
  renderQueryTemplate(profile.serviceLog.fallbackPredicateTemplate, {
    values: { '{{VALUE}}': '' },
    queryId: `${profile.id}.serviceLog.fallbackPredicate`,
  });
  if (profile.executionLog !== undefined) {
    renderQueryTemplate(profile.executionLog.queryTemplate, {
      values: { '{{REQUEST_ID_FILTER_CLAUSE}}': '' },
      queryId: `${profile.id}.executionLog`,
    });
    renderQueryTemplate(profile.executionLog.requestIdPredicateTemplate, {
      values: { '{{VALUE}}': '' },
      queryId: `${profile.id}.executionLog.requestIdPredicate`,
    });
  }
}

/**
 * Parità config↔profilo. Se il config valorizza
 * `entryService.executionLogGroup` ma il profilo non ha la capability,
 * fail-fast: il runbook non gira mai gli step di execution log.
 *
 * Usa `getEffectiveExecutionLogGroup` per allineare
 * la semantica con `isExecutionLogEnabled` (stringa vuota/whitespace =
 * assente).
 */
function validateCapabilityParity(config: ApiGwAlarmConfig, profile: ApiGwQueryProfile): void {
  const validationContext = context(config);
  const executionLogGroup = getEffectiveExecutionLogGroup(config);
  if (executionLogGroup !== undefined && profile.executionLog === undefined) {
    failAlarmConfig(
      validationContext,
      'entryService.executionLogGroup is set but ' +
        `the profile "${profile.id}" has no executionLog capability. ` +
        'Either remove executionLogGroup from the entry service or switch to a profile that supports it.',
    );
  }

  if (config.authorizerFailureCheck !== undefined && profile.accessLog.schema.authorizer === undefined) {
    failAlarmConfig(
      validationContext,
      'authorizerFailureCheck is set but ' +
        `the profile "${profile.id}" has no accessLog.authorizer capability. ` +
        'Either remove authorizerFailureCheck or switch to a profile that declares authorizer fields.',
    );
  }

  if (config.authorizerFailureCheck !== undefined) {
    const hasDefault = config.authorizerFailureCheck.defaultAuthorizer !== undefined;
    const hasRules = (config.authorizerFailureCheck.rules?.length ?? 0) > 0;
    if (!hasDefault && !hasRules) {
      failAlarmConfig(
        validationContext,
        'authorizerFailureCheck requires a defaultAuthorizer or at least one selection rule.',
      );
    }
  }
}

function validateExecutionLogAnalysisMode(config: ApiGwAlarmConfig, profile: ApiGwQueryProfile): void {
  const mode = config.executionLogAnalysisMode;
  if (mode !== undefined && mode !== 'terminal' && mode !== 'best-effort') {
    failAlarmConfig(
      context(config),
      `unsupported executionLogAnalysisMode '${String(mode)}'. Expected 'terminal' or 'best-effort'.`,
    );
  }

  if (mode !== undefined && !isExecutionLogEnabled(config, profile)) {
    failAlarmConfig(
      context(config),
      'executionLogAnalysisMode is set but execution logs are not enabled. ' +
        'Configure entryService.executionLogGroup and use a profile with executionLog capability, ' +
        'or remove executionLogAnalysisMode.',
    );
  }
}

/**
 * The step ids the pipeline wires for the config, hooks excluded: the hooks must not take them.
 */
function reservedStepIds(config: ApiGwAlarmConfig, profile: ApiGwQueryProfile): ReadonlySet<string> {
  const ids = new Set<string>([STEP_IDS.prepare, STEP_IDS.accessLog, STEP_IDS.parse, STEP_IDS.descend]);
  if (config.authorizerFailureCheck !== undefined) ids.add(STEP_IDS.authorizerFailure);
  if (isExecutionLogEnabled(config, profile)) {
    ids.add(STEP_IDS.executionLog);
    if (config.executionLogAnalysisMode !== 'best-effort') ids.add(STEP_IDS.stopExecutionLog);
  }
  for (const service of [config.entryService, ...(config.services ?? [])]) {
    ids.add(`query-${service.name}`);
    ids.add(`descend-${service.name}`);
  }
  return ids;
}

/**
 * Collisioni step ID. Gli hook non devono usare ID riservati alla
 * pipeline canonica (es. un preStep che si chiama `parse-api-gw-errors`).
 */
function validateNoStepIdCollisions(config: ApiGwAlarmConfig, profile: ApiGwQueryProfile): void {
  // One check for every anchor: hooks share a single id namespace, so a step
  // declared twice at different anchors is still a duplicate.
  assertStepDescriptorIds(context(config), config.hooks, reservedStepIds(config, profile), 'hook');
}

function context(config: ApiGwAlarmConfig): AlarmConfigValidationContext {
  return { builderName: 'createSendApiGwAlarmRunbook', runbookId: config.id };
}

/**
 * Runs all build-time validations for an API Gateway alarm config. Throws a
 * descriptive `Error` on the first problem (fail-fast at build time, not at
 * runtime). Single public entry point for the builder validations.
 *
 * @param config - The API Gateway alarm configuration
 * @param profile - The resolved query profile
 */
export function validateApiGwAlarmConfig(config: ApiGwAlarmConfig, profile: ApiGwQueryProfile): void {
  validatePlaceholders(profile);
  validateCapabilityParity(config, profile);
  validateExecutionLogAnalysisMode(config, profile);
  validateNoStepIdCollisions(config, profile);
}
