import type { Core } from '@go-automation/go-common';
import type { AnalysisDraftV1 } from '@go-automation/go-runbook';

/**
 * Mostra nel dry-run l'analisi che il `complete` proporrebbe.
 *
 * Il dry-run esisteva per dire *se* un runbook riconosce il caso; con la
 * materializzazione automatica la domanda operativa diventa *cosa* verrebbe
 * scritto, e senza questo blocco l'unico modo di saperlo sarebbe lanciare
 * davvero l'esecuzione (§5.3).
 *
 * @param script - Script GO corrente, per il logger
 * @param analysis - Draft prodotto dal dry-run; assente se l'esito non porta analisi
 */
export function logDryRunAnalysis(script: Core.GOScript, analysis: AnalysisDraftV1 | undefined): void {
  if (analysis === undefined) {
    script.logger.info('[dry-run] Nessuna analisi proposta per questo esito.');
    return;
  }

  if (analysis.kind === 'UNKNOWN_CASE_CONTEXT') {
    script.logger.info('[dry-run] Caso non riconosciuto: verrebbe inviato solo il contesto, senza materializzare.');
    logReferences(script, analysis);
    return;
  }

  script.logger.info(`[dry-run] Analisi proposta: ${analysis.analysisType}, stato proposto ${analysis.proposedStatus}`);
  script.logger.info(`[dry-run]   conclusione: ${firstLine(analysis.conclusionNotes)}`);
  if (analysis.ignoreReasonCode !== undefined) {
    script.logger.info(`[dry-run]   ignore reason: ${analysis.ignoreReasonCode}`);
  }
  logReferences(script, analysis);
  // I riferimenti dichiarati sono ciò che Watchtower risolve contro il
  // censimento: se uno non esiste, l'apply si blocca. Vederli qui è il punto.
  script.logger.info('[dry-run] I riferimenti dichiarati devono esistere nel censimento del prodotto.');
}

function logReferences(script: Core.GOScript, analysis: AnalysisDraftV1): void {
  if (analysis.runbookName !== undefined) script.logger.info(`[dry-run]   runbook: ${analysis.runbookName}`);
  if (analysis.resources.length > 0) {
    script.logger.info(`[dry-run]   risorse: ${analysis.resources.map((r) => r.name).join(', ')}`);
  }
  if (analysis.downstreams.length > 0) {
    script.logger.info(`[dry-run]   downstream: ${analysis.downstreams.join(', ')}`);
  }
  if (analysis.finalActions.length > 0) {
    script.logger.info(`[dry-run]   final action: ${analysis.finalActions.join(', ')}`);
  }
  if (analysis.links.length > 0) {
    script.logger.info(`[dry-run]   link: ${analysis.links.length}`);
  }
}

function firstLine(text: string): string {
  const line = text.split('\n')[0] ?? '';
  return line.length > 160 ? `${line.slice(0, 160)}…` : line;
}
