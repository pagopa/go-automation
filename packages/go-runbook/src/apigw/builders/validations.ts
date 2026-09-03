import type { ApiGwAlarmConfig } from '../types/ApiGwAlarmConfig.js';
import type { ApiGwQueryProfile } from '../profiles/ApiGwQueryProfile.js';
import { renderQueryTemplate } from '../profiles/render/renderQueryTemplate.js';
import {
  assertKnownCaseStepRefs,
  assertStepDescriptorIds,
  failAlarmConfig,
  type AlarmConfigValidationContext,
} from '../../validation/alarmConfigValidation.js';
import { getEffectiveExecutionLogGroup, isExecutionLogEnabled } from './executionLogEnablement.js';

/**
 * V1: dry-run di `renderQueryTemplate` su tutti i template del profilo
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
 * V2: parità config↔profilo. Se il config valorizza
 * `entryService.executionLogGroup` ma il profilo non ha la capability,
 * fail-fast: il runbook non gira mai gli step di execution log.
 *
 * V03/V04 (E2/D19): usa `getEffectiveExecutionLogGroup` per allineare
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
 * Calcola l'insieme degli step ID effettivamente cablati nella pipeline
 * dato il config risolto. È deterministico.
 */
function computeWiredStepIds(config: ApiGwAlarmConfig, profile: ApiGwQueryProfile): ReadonlySet<string> {
  const ids = new Set<string>();
  ids.add('prepare-api-gw-section');
  ids.add('query-api-gw-logs');

  if (config.authorizerFailureCheck !== undefined) {
    ids.add('evaluate-api-gw-authorizer-failure');
  }

  if (isExecutionLogEnabled(config, profile)) {
    ids.add('query-api-gw-execution-logs');
    if (config.executionLogAnalysisMode !== 'best-effort') {
      ids.add('stop-api-gw-execution-log-unresolved');
    }
  }

  ids.add('parse-api-gw-errors');

  for (const hook of config.hooks ?? []) {
    ids.add(hook.step.id);
  }

  const services = [config.entryService, ...(config.services ?? [])];
  for (const s of services) {
    ids.add(`query-${s.name}`);
    ids.add(`analyze-${s.name}`);
    ids.add(`decide-${s.name}`);
  }

  return ids;
}

/**
 * V4: collisioni step ID. Gli hook non devono usare ID riservati alla
 * pipeline canonica (es. un preStep che si chiama `parse-api-gw-errors`).
 */
function validateNoStepIdCollisions(config: ApiGwAlarmConfig, profile: ApiGwQueryProfile): void {
  // One check for every anchor: hooks share a single id namespace, so a step
  // declared twice at different anchors is still a duplicate.
  const reserved = computeWiredStepIds({ ...config, hooks: [] }, profile);
  assertStepDescriptorIds(context(config), config.hooks, reserved, 'hook');
}

/**
 * V3: orphan step refs. Per ogni `KnownCase` verifica che gli step citati
 * con prefisso `steps.` siano effettivamente cablati nella pipeline. Cattura
 * il bug "runbook che cita uno step inesistente nel profilo corrente".
 */
function validateKnownCaseStepRefs(config: ApiGwAlarmConfig, profile: ApiGwQueryProfile): void {
  assertKnownCaseStepRefs(
    context(config),
    config.knownCases,
    computeWiredStepIds(config, profile),
    ` (profile "${profile.id}" + current config). ` +
      'Either switch profile / config to wire that step, or remove the reference from the known case.',
  );
}

function context(config: ApiGwAlarmConfig): AlarmConfigValidationContext {
  return { builderName: 'createApiGwAlarmRunbook', runbookId: config.id };
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
  validateKnownCaseStepRefs(config, profile);
}
