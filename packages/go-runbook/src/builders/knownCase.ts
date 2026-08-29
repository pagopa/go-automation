import type { CaseAction } from '../actions/CaseAction.js';
import type { Condition } from '../types/Condition.js';
import type { KnownCase } from '../types/KnownCase.js';
import type { KnownCaseAnalysis } from '../types/KnownCaseAnalysis.js';

/** Prefix on which `ActionExecutor` renders a matched case as a table. */
const KNOWN_CASE_PREFIX = '[CASO NOTO]';

/** Label of the row carrying the resolution, first among the details. */
const RESOLUTION_LABEL = 'Risoluzione';

/** One `Etichetta: valore` row of the console table; the value may hold `{{vars.x}}`. */
export type KnownCaseRow = readonly [label: string, value: string];

/**
 * Declarative form of a known case.
 *
 * `resolution` is declared once and reaches both destinations: the
 * `Risoluzione` row an operator reads in the console, and
 * `analysis.resolution`, which becomes the `conclusionNotes` published to
 * Watchtower. Writing it twice is what let the two drift apart.
 */
export interface KnownCaseSpec {
  readonly id: string;
  /** Full wording of the case, used by the trace and the runbook output. */
  readonly description: string;
  readonly priority: number;
  readonly condition: Condition;
  /**
   * Table title. Defaults to {@link description}; declare it only to give the
   * console a shorter wording than the full description.
   */
  readonly title?: string;
  /** What to do about the case. Feeds the console row and the analysis draft. */
  readonly resolution: string;
  /** Evidence rows rendered after the resolution. */
  readonly details?: ReadonlyArray<KnownCaseRow>;
  /** Console severity. Defaults to `info`: a recognised case is not a failure. */
  readonly level?: 'info' | 'warn' | 'error';
  /** Analysis directives, minus the resolution this spec already carries. */
  readonly analysis: Omit<KnownCaseAnalysis, 'resolution'>;
}

/**
 * Builds a known case from a single declaration.
 *
 * @param spec - The case, with its resolution declared once
 * @returns The {@link KnownCase} consumed by the runbook builders
 *
 * @example
 * ```typescript
 * knownCase({
 *   id: 'inad-500',
 *   description: '[DOWNSTREAM INAD] HTTP 500 durante il recupero del domicilio digitale',
 *   priority: 130,
 *   condition: stepEvidenceMatches('query-pn-national-registries', '…'),
 *   resolution: INAD_RECOVERY_RESOLUTION,
 *   details: [['Servizio', 'pn-national-registries'], ['Errore', '{{vars.nationalRegistriesErrorMsg}}']],
 *   analysis: { proposedStatus: 'COMPLETED', analysisType: 'ANALYZABLE' },
 * });
 * ```
 */
export function knownCase(spec: KnownCaseSpec): KnownCase {
  const rows: ReadonlyArray<KnownCaseRow> = [[RESOLUTION_LABEL, spec.resolution], ...(spec.details ?? [])];
  const action: CaseAction = {
    type: 'log',
    level: spec.level ?? 'info',
    renderAs: 'known-case',
    message: [
      `${KNOWN_CASE_PREFIX} ${spec.title ?? spec.description}`,
      ...rows.map(([label, value]) => `${label}: ${value}`),
    ].join('\n'),
  };

  return {
    id: spec.id,
    description: spec.description,
    priority: spec.priority,
    condition: spec.condition,
    action,
    analysis: { resolution: spec.resolution, ...spec.analysis },
  };
}
