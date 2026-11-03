/**
 * Send plan shown before the confirmation (§14.2).
 */

import type { Core } from '@go-automation/go-common';
import type { Dispatch } from '@go-automation/go-send';

import type { DispatchTarget } from '../types/DispatchTarget.js';
import type { PlanContext } from '../types/PlanContext.js';

/**
 * Prints the send plan.
 *
 * @param logger - Script logger
 * @param plan - Target, options, preflight and validation summary
 */
export function displayPlan(logger: Core.GOLogger, plan: PlanContext): void {
  const { target, options, run, preflight, shared, summary, timelinesProfile } = plan;
  const sendingRows = summary.validRows;
  const estimatedSeconds = Math.ceil(sendingRows / options.tuning.rate);

  logger.section(options.dryRun ? 'Piano di invio (DRY RUN: nessuna chiamata)' : 'Piano di invio');
  logger.keyValueTable({
    Run: `${options.runId}${run.previousRunInfoPath === undefined ? '' : ` (ripresa di ${run.previousRunInfoPath})`}`,
    Ambiente: target.description === undefined ? target.name : `${target.name} — ${target.description}`,
    Modalità: `e2e → ${target.basePath} (API ${options.apiVersion}, chiave ${target.apiKeyLabel})`,
    Produzione: target.production ? 'SÌ' : 'no',
    'A nome di': groupLine(target, preflight),
    'Righe con group diverso': countOther(summary.groups, target.groupId ?? ''),
    Mittenti: formatCounts(summary.senders),
    Documenti: documentsLine(summary, shared),
    Righe: `${summary.totalRows} lette · ${summary.validRows} valide · ${summary.invalidRows} non valide`,
    Prodotti: formatCounts(summary.products),
    'Con PEC': summary.digitalRows,
    Fasi: phasesLine(options, timelinesProfile),
    Rate: `${options.tuning.rate}/s → invio stimato ~${estimatedSeconds} s`,
    Output: options.output.outputPath,
  });
  for (const warning of preflight?.warnings ?? []) logger.warning(warning);
  if (summary.senders.size > 1)
    logger.warning('Il file contiene mittenti diversi: di solito è un errore di preparazione');
  if (summary.duplicateRowKeys.length > 0) {
    logger.error(`Chiavi di riga duplicate (bloccante): ${summary.duplicateRowKeys.slice(0, 10).join(', ')}`);
  }
}

function groupLine(target: DispatchTarget, preflight: Dispatch.PreflightReport | undefined): string {
  if (preflight?.group !== undefined) {
    return `${preflight.group.name} (${preflight.group.id}, ${preflight.group.status})`;
  }
  if (target.groupId !== undefined) return `${target.groupId} (non verificato in dry run)`;
  const groups = preflight?.activeGroups.map((group) => `${group.name} (${group.id})`).join(', ');
  return groups === undefined || groups === '' ? 'nessun gruppo' : `nessun gruppo; gruppi attivi della PA: ${groups}`;
}

function documentsLine(
  summary: Dispatch.ValidationSummary,
  shared: ReadonlyArray<Dispatch.DocumentRef> | undefined,
): string {
  const parts: string[] = [];
  const sharedRows = summary.documentSources.get('shared') ?? 0;
  if (sharedRows > 0) {
    const keys = (shared ?? []).map((document) => `${document.title} (${document.key})`).join(', ');
    parts.push(`condiviso: ${keys} × ${sharedRows}`);
  }
  if (summary.rowFiles > 0)
    parts.push(`per riga: ${summary.rowFiles} file (${summary.distinctRowFiles} distinti) da caricare`);
  const references = summary.documentSources.get('reference') ?? 0;
  if (references > 0) parts.push(`riferimenti × ${references}`);
  const pratiche = summary.documentSources.get('pratica') ?? 0;
  if (pratiche > 0) parts.push(`pratica × ${pratiche}`);
  return parts.join(' · ');
}

function formatCounts(counts: ReadonlyMap<string, number>): string {
  if (counts.size === 0) return '—';
  return [...counts.entries()].map(([key, count]) => `${key === '' ? '(vuoto)' : key} × ${count}`).join(' · ');
}

function countOther(groups: ReadonlyMap<string, number>, expected: string): number {
  let other = 0;
  for (const [group, count] of groups) if (group !== expected) other += count;
  return other;
}

function phasesLine(options: Dispatch.DispatchSessionOptions, timelinesProfile: string | undefined): string {
  const phases = [
    ...(options.send ? ['send'] : ['(IUN dall input)']),
    ...(options.verify ? ['verify'] : []),
    ...(options.requestId === undefined ? [] : [`request-id (AWS: ${timelinesProfile ?? '?'})`]),
  ];
  return phases.join(' → ');
}
