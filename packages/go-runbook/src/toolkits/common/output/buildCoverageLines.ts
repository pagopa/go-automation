import type { RunbookExecutionResult } from '../../../engine/types/RunbookExecutionResult.js';
import type { CoverageReason } from '../../../engine/types/CoverageReason.js';

/** Words of the coverage line, by reason of the incomplete source. */
const COVERAGE_REASON_WORDS: Readonly<Record<CoverageReason, string>> = {
  saturated: 'sature',
  unavailable: 'non disponibili',
  skipped: 'saltate',
  manual: 'a correlazione manuale',
};

/** Words of the unit of the observed errors. */
const INTERRUPTION_WORDS: Readonly<Record<string, string>> = {
  skipped: 'identificatore mancante',
  unavailable: 'lettura non disponibile',
  incomplete: 'evidenza incompleta',
  failed: 'analisi fallita',
  cycle: 'ciclo',
};

const UNIT_WORDS: Readonly<Record<'request' | 'invocation' | 'errorRow', string>> = {
  request: 'richieste',
  invocation: 'invocazioni',
  errorRow: "righe d'errore",
};

/**
 * The coverage lines of an execution: compact counts by reason, never the text of a provider error.
 *
 * - `Non esaminati: K <unit>` when the runbook observed more errors than it examined;
 * - `Evidenza incompleta: K fonti (<reason> N, …)` when some sources are incomplete.
 *
 * Shared by the analysis notes and the console. Complexity: O(C) over the coverage entries.
 *
 * @param result - Result of the execution
 * @returns The lines, empty when there is nothing to report
 *
 * @example
 * ```typescript
 * buildCoverageLines(result);
 * // ['Non esaminati: 4 richieste', 'Evidenza incompleta: 1 fonti (sature 1)']
 * ```
 */
export function buildCoverageLines(
  result: Pick<RunbookExecutionResult, 'coverage' | 'observedErrors' | 'chains' | 'tree'>,
): ReadonlyArray<string> {
  const lines: string[] = [];
  const unrecognized = unrecognizedLeaves(result);
  if (unrecognized > 0) lines.push(`Non riconosciuti: ${String(unrecognized)}`);
  const interrupted = new Map<string, number>();
  for (const group of result.chains ?? []) {
    for (const member of group.members) {
      const reason = member.interruption?.reason;
      if (reason !== undefined) interrupted.set(reason, (interrupted.get(reason) ?? 0) + 1);
    }
  }
  if (interrupted.size > 0) {
    const total = [...interrupted.values()].reduce((sum, count) => sum + count, 0);
    const detail = [...interrupted].map(
      ([reason, count]) => `${INTERRUPTION_WORDS[reason] ?? reason} ${String(count)}`,
    );
    lines.push(`Catene interrotte: ${String(total)} (${detail.join(', ')})`);
  }
  const errors = result.observedErrors;
  if (errors !== undefined && errors.observed > errors.examined) {
    const unexamined = errors.observed - errors.examined;
    lines.push(
      `Non esaminati: ${errors.lowerBound === true ? 'almeno ' : ''}${String(unexamined)} ${UNIT_WORDS[errors.unit]}`,
    );
  }
  if (result.coverage.length > 0) {
    const counts = new Map<keyof typeof COVERAGE_REASON_WORDS, number>();
    for (const entry of result.coverage) {
      const reason = entry.reason ?? 'unavailable';
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    const detail = [...counts].map(([reason, count]) => `${COVERAGE_REASON_WORDS[reason]} ${String(count)}`).join(', ');
    lines.push(`Evidenza incompleta: ${String(result.coverage.length)} fonti (${detail})`);
  }
  return lines;
}

/** The last nodes of the chains with no case and no failure, each once. */
function unrecognizedLeaves(result: Pick<RunbookExecutionResult, 'chains' | 'tree'>): number {
  if (result.tree === undefined) return 0;
  const byId = new Map(result.tree.map((node) => [node.id, node]));
  const leaves = new Set<string>();
  for (const group of result.chains ?? []) {
    for (const member of group.members) {
      if (member.end !== 'leaf') continue;
      const leaf = byId.get(member.nodeIds[member.nodeIds.length - 1] ?? '');
      if (leaf !== undefined && leaf.status !== 'failed' && leaf.detections.length === 0) leaves.add(leaf.id);
    }
  }
  return leaves.size;
}
