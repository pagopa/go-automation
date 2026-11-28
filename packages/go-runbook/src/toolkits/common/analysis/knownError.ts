import type { CaseAction, Condition, KnownError, LogActionLevel, LogActionRow } from '../../../engine/index.js';
import type { KnownErrorAnalysis } from './KnownErrorAnalysis.js';

/** Label of the row carrying the resolution, first among the details. */
const RESOLUTION_LABEL = 'Risoluzione';

/**
 * Declarative form of a known error.
 *
 * `resolution` is declared once and reaches both destinations: the
 * `Risoluzione` row an operator reads in the console, and
 * `analysis.resolution`, which becomes the `conclusionNotes` published to
 * Watchtower. Writing it twice is what let the two drift apart.
 */
export interface KnownErrorSpec {
  readonly code: string;
  /** Full wording of the case, used by the trace and the runbook output. */
  readonly description: string;
  /** Cases this one replaces when both match (see `KnownError.supersedes`). */
  readonly supersedes?: ReadonlyArray<string>;
  readonly condition: Condition;
  /**
   * Table title. Defaults to {@link description}; declare it only to give the
   * console a shorter wording than the full description.
   */
  readonly title?: string;
  /** What to do about the case. Feeds the console row and the analysis draft. */
  readonly resolution: string;
  /** Evidence rows rendered after the resolution. */
  readonly details?: ReadonlyArray<LogActionRow>;
  /** Console severity. Defaults to `info`: a recognised case is not a failure. */
  readonly level?: LogActionLevel;
  /** Analysis directives, minus the resolution this spec already carries. */
  readonly analysis: Omit<KnownErrorAnalysis, 'resolution'>;
}

/**
 * Builds a known error from a single declaration.
 *
 * @param spec - The case, with its resolution declared once
 * @returns The {@link KnownError} consumed by the runbook builders
 *
 * @example
 * ```typescript
 * knownError({
 *   id: 'inad-500',
 *   description: '[DOWNSTREAM INAD] HTTP 500 durante il recupero del domicilio digitale',
 *   condition: stepEvidenceMatches('query-pn-national-registries', '…'),
 *   resolution: INAD_RECOVERY_RESOLUTION,
 *   details: [['Servizio', 'pn-national-registries'], ['Errore', '{{vars.nationalRegistriesErrorMsg}}']],
 *   analysis: { proposedStatus: 'COMPLETED', analysisType: 'ANALYZABLE' },
 * });
 * ```
 */
export function knownError(spec: KnownErrorSpec): KnownError {
  const action: CaseAction = {
    type: 'log',
    level: spec.level ?? 'info',
    renderAs: 'known-error',
    title: spec.title ?? spec.description,
    details: [[RESOLUTION_LABEL, spec.resolution], ...(spec.details ?? [])],
  };

  return {
    code: spec.code,
    description: spec.description,
    ...(spec.supersedes === undefined ? {} : { supersedes: spec.supersedes }),
    condition: spec.condition,
    action,
    analysis: { resolution: spec.resolution, ...spec.analysis },
  };
}
