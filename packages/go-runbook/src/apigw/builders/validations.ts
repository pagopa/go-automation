import type { ApiGwAlarmConfig } from '../types/ApiGwAlarmConfig.js';
import type { ApiGwQueryProfile } from '../profiles/ApiGwQueryProfile.js';
import type { KnownCase } from '../../types/KnownCase.js';
import type { Condition } from '../../types/Condition.js';
import { renderQueryTemplate } from '../profiles/render/renderQueryTemplate.js';
import { getEffectiveExecutionLogGroup, isExecutionLogEnabled } from './executionLogEnablement.js';

/**
 * V1: dry-run di `renderQueryTemplate` su tutti i template del profilo
 * con valori dummy, per verificare la presenza dei placeholder
 * obbligatori. Fail-fast a build time invece che a runtime sulla prima
 * esecuzione del runbook.
 */
export function validatePlaceholders(profile: ApiGwQueryProfile): void {
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
export function validateCapabilityParity(config: ApiGwAlarmConfig, profile: ApiGwQueryProfile): void {
  const executionLogGroup = getEffectiveExecutionLogGroup(config);
  if (executionLogGroup !== undefined && profile.executionLog === undefined) {
    throw new Error(
      `createApiGwAlarmRunbook "${config.id}": entryService.executionLogGroup is set but ` +
        `the profile "${profile.id}" has no executionLog capability. ` +
        'Either remove executionLogGroup from the entry service or switch to a profile that supports it.',
    );
  }
}

/**
 * Calcola l'insieme degli step ID effettivamente cablati nella pipeline
 * dato il config risolto. È deterministico.
 */
export function computeWiredStepIds(config: ApiGwAlarmConfig, profile: ApiGwQueryProfile): ReadonlySet<string> {
  const ids = new Set<string>();
  ids.add('prepare-api-gw-section');
  ids.add('query-api-gw-logs');

  if (isExecutionLogEnabled(config, profile)) {
    ids.add('query-api-gw-execution-logs');
    ids.add('stop-api-gw-execution-log-unresolved');
  }

  ids.add('parse-api-gw-errors');

  for (const descriptor of config.preSteps ?? []) {
    ids.add(descriptor.step.id);
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
 * V4: collisioni step ID. I preSteps non devono usare ID riservati alla
 * pipeline canonica (es. un preStep che si chiama `parse-api-gw-errors`).
 */
export function validateNoStepIdCollisions(config: ApiGwAlarmConfig, profile: ApiGwQueryProfile): void {
  const reserved = computeWiredStepIds({ ...config, preSteps: [] }, profile);
  for (const descriptor of config.preSteps ?? []) {
    if (reserved.has(descriptor.step.id)) {
      throw new Error(
        `createApiGwAlarmRunbook "${config.id}": preStep id "${descriptor.step.id}" ` +
          'collides with a reserved pipeline step id.',
      );
    }
  }
}

/**
 * Visita ricorsiva di `Condition` per raccogliere tutti i `ref` che
 * iniziano con `steps.`.
 */
function collectStepRefs(condition: Condition, into: Set<string>): void {
  switch (condition.type) {
    case 'compare':
    case 'pattern':
    case 'exists':
    case 'contains': {
      if (condition.ref.startsWith('steps.')) {
        const afterPrefix = condition.ref.slice('steps.'.length);
        const stepId = afterPrefix.split('.')[0] ?? '';
        if (stepId !== '') into.add(stepId);
      }
      return;
    }
    case 'and':
    case 'or': {
      for (const c of condition.conditions) collectStepRefs(c, into);
      return;
    }
    case 'not': {
      collectStepRefs(condition.condition, into);
      return;
    }
    default: {
      const _exhaustive: never = condition;
      throw new Error(`Unhandled condition type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * V3: orphan step refs. Per ogni `KnownCase`, ricorre nella `condition`
 * e per ogni `ref` con prefisso `steps.` verifica che lo step ID sia
 * effettivamente cablato nella pipeline. Cattura il bug
 * "runbook che cita uno step inesistente nel profilo corrente".
 */
export function validateKnownCaseStepRefs(config: ApiGwAlarmConfig, profile: ApiGwQueryProfile): void {
  const wired = computeWiredStepIds(config, profile);
  for (const knownCase of config.knownCases) {
    const refs = new Set<string>();
    collectStepRefs(knownCase.condition, refs);
    for (const stepId of refs) {
      if (!wired.has(stepId)) {
        throw orphanStepRefError(config, profile, knownCase, stepId);
      }
    }
  }
}

function orphanStepRefError(
  config: ApiGwAlarmConfig,
  profile: ApiGwQueryProfile,
  knownCase: KnownCase,
  stepId: string,
): Error {
  return new Error(
    `createApiGwAlarmRunbook "${config.id}": knownCase "${knownCase.id}" references ` +
      `step "${stepId}" which is not wired in this runbook ` +
      `(profile "${profile.id}" + current config). ` +
      'Either switch profile / config to wire that step, or remove the reference from the known case.',
  );
}
