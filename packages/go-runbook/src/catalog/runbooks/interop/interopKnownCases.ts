/**
 * Shared helpers for INTEROP k8s known cases: conditions that scan both the
 * application-logs query and the CID tracker query of a runbook, and log
 * actions rendered with the runbook's INTEROP context vars.
 */
import type { AnalysisLinkRef, CaseAction, Condition, InteropDownstream, KnownCase } from '../framework.js';

/** Per-runbook references needed to build INTEROP known cases. */
export interface InteropKnownCaseRefs {
  readonly applicationLogsStepId: string;
  readonly cidTrackerStepId: string;
  readonly varPrefix: string;
}

/** Declarative single-regex known case. */
export interface InteropKnownCaseConfig {
  readonly id: string;
  readonly description: string;
  readonly priority: number;
  readonly regex: string;
  readonly resolution: string;
  /** Proposed state: the apply persists IN_PROGRESS, a CONFIRMED review promotes it. */
  readonly proposedStatus: 'IN_PROGRESS' | 'COMPLETED';
  readonly analysisType: 'ANALYZABLE' | 'IGNORABLE';
  readonly ignoreReasonCode?: string;
  readonly errorDetails?: string;
  /** Declared only through `INTEROP_DOWNSTREAMS`, never as raw strings. */
  readonly downstreams?: ReadonlyArray<InteropDownstream>;
  readonly finalActions?: ReadonlyArray<string>;
  readonly links?: ReadonlyArray<AnalysisLinkRef>;
}

/**
 * Builds a known case whose condition matches the regex against both the
 * application-logs evidence and the CID tracker evidence of the runbook.
 *
 * @param refs - Step ids and var prefix of the owning runbook
 * @param config - Known case id, priority, regex and resolution text
 * @returns The assembled known case
 */
export function interopKnownCase(refs: InteropKnownCaseRefs, config: InteropKnownCaseConfig): KnownCase {
  return {
    id: config.id,
    description: config.description,
    priority: config.priority,
    condition: anyInteropEvidenceMatches(refs, config.regex),
    action: interopKnownCaseAction(refs, config.description, config.resolution),
    analysis: {
      resolution: config.resolution,
      proposedStatus: config.proposedStatus,
      analysisType: config.analysisType,
      ...(config.ignoreReasonCode === undefined ? {} : { ignoreReasonCode: config.ignoreReasonCode }),
      ...(config.errorDetails === undefined ? {} : { errorDetails: config.errorDetails }),
      ...(config.downstreams === undefined ? {} : { downstreams: config.downstreams }),
      ...(config.finalActions === undefined ? {} : { finalActions: config.finalActions }),
      ...(config.links === undefined ? {} : { links: config.links }),
    },
  };
}

/**
 * Condition matching a regex against either query step of the runbook.
 *
 * @param refs - Step ids of the owning runbook
 * @param regex - Pattern evaluated against the JSON-stringified evidence rows
 * @returns An `or` condition over both query steps
 */
export function anyInteropEvidenceMatches(refs: InteropKnownCaseRefs, regex: string): Condition {
  return {
    type: 'or',
    conditions: [
      { type: 'contains', ref: `steps.${refs.applicationLogsStepId}`, regex },
      { type: 'contains', ref: `steps.${refs.cidTrackerStepId}`, regex },
    ],
  };
}

/**
 * Standard log action for a matched INTEROP known case.
 *
 * @param refs - Var prefix of the owning runbook
 * @param title - Case title rendered in the log message
 * @param resolution - Operational resolution text
 * @returns The log action
 */
export function interopKnownCaseAction(refs: InteropKnownCaseRefs, title: string, resolution: string): CaseAction {
  return {
    type: 'log',
    level: 'info',
    renderAs: 'known-case',
    message:
      `[CASO NOTO] ${title}\n` +
      `Risoluzione: ${resolution}\n` +
      'Ambiente: {{vars.interopEnvironment}}\n' +
      'Log group: {{vars.interopLogGroup}}\n' +
      'Servizio: {{vars.interopPodApp}}\n' +
      `CID analizzati: {{vars.${refs.varPrefix}CidCount}}\n`,
  };
}
