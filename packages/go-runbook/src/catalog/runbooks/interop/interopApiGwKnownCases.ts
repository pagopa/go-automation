import type { AnalysisLinkRef, CaseAction, Condition, InteropDownstream, KnownCase } from '../framework.js';

import { anyStepEvidenceMatches, stepEvidenceMatches } from '../common/evidenceConditions.js';

import type { InteropEnvironment } from './InteropEnvironment.js';

interface InteropApiGwKnownCaseRefs {
  readonly apiGatewayStepId: string;
  readonly applicationLogsStepId: string;
  readonly cidTrackerStepId: string;
  readonly varPrefix: string;
  readonly applicationLogsLabel: string;
}

type InteropApiGwKnownCaseEvidence = 'ANY' | 'API_GATEWAY';

interface InteropApiGwKnownCaseConfig {
  readonly id: string;
  readonly description: string;
  readonly priority: number;
  readonly regex: string;
  readonly resolution: string;
  readonly proposedStatus: 'IN_PROGRESS' | 'COMPLETED';
  readonly evidence?: InteropApiGwKnownCaseEvidence;
  readonly environments?: ReadonlyArray<InteropEnvironment>;
  readonly downstreams?: ReadonlyArray<InteropDownstream>;
  readonly resources?: ReadonlyArray<string>;
  readonly finalActions?: ReadonlyArray<string>;
  readonly links?: ReadonlyArray<AnalysisLinkRef>;
  readonly excludeRegex?: string;
}

type InteropApiGwKnownCaseFn = (config: InteropApiGwKnownCaseConfig) => KnownCase;

/** Creates a runbook-bound factory for INTEROP API Gateway known cases. */
export function createInteropApiGwKnownCaseFactory(refs: InteropApiGwKnownCaseRefs): InteropApiGwKnownCaseFn {
  return (config) => {
    const baseCondition = evidenceMatches(refs, config.regex, config.evidence ?? 'ANY');
    const matchingCondition =
      config.excludeRegex === undefined
        ? baseCondition
        : {
            type: 'and' as const,
            conditions: [
              baseCondition,
              { type: 'not' as const, condition: anyEvidenceMatches(refs, config.excludeRegex) },
            ],
          };

    return {
      id: config.id,
      description: config.description,
      priority: config.priority,
      condition: withEnvironment(matchingCondition, config.environments),
      action: knownCaseAction(refs, config.description, config.resolution),
      analysis: {
        resolution: config.resolution,
        proposedStatus: config.proposedStatus,
        analysisType: 'ANALYZABLE',
        ...(config.downstreams === undefined ? {} : { downstreams: config.downstreams }),
        ...(config.resources === undefined
          ? {}
          : { resources: config.resources.map((name) => ({ name, role: 'CASE_RELATED' as const })) }),
        ...(config.finalActions === undefined ? {} : { finalActions: config.finalActions }),
        ...(config.links === undefined ? {} : { links: config.links }),
      },
    };
  };
}

function evidenceMatches(
  refs: InteropApiGwKnownCaseRefs,
  regex: string,
  evidence: InteropApiGwKnownCaseEvidence,
): Condition {
  return evidence === 'API_GATEWAY' ? apiGatewayEvidenceMatches(refs, regex) : anyEvidenceMatches(refs, regex);
}

function anyEvidenceMatches(refs: InteropApiGwKnownCaseRefs, regex: string): Condition {
  return anyStepEvidenceMatches([refs.apiGatewayStepId, refs.applicationLogsStepId, refs.cidTrackerStepId], regex);
}

function apiGatewayEvidenceMatches(refs: InteropApiGwKnownCaseRefs, regex: string): Condition {
  return stepEvidenceMatches(refs.apiGatewayStepId, regex);
}

function withEnvironment(condition: Condition, environments: ReadonlyArray<InteropEnvironment> | undefined): Condition {
  if (environments === undefined) return condition;
  return {
    type: 'and',
    conditions: [{ type: 'contains', ref: 'vars.interopEnvironment', value: environments }, condition],
  };
}

function knownCaseAction(refs: InteropApiGwKnownCaseRefs, title: string, resolution: string): CaseAction {
  return {
    type: 'log',
    level: 'info',
    renderAs: 'known-case',
    title,
    details: [
      ['Risoluzione', resolution],
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['API Gateway ID', '{{vars.interopApiGwId}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      [refs.applicationLogsLabel, `{{vars.${refs.varPrefix}LogCount}}`],
      ['CID analizzati', `{{vars.${refs.varPrefix}CidCount}}`],
    ],
  };
}
