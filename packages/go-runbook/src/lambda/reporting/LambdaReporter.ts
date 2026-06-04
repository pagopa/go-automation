import type { GOLogger } from '@go-automation/go-common/core';
import type { TerminationReason } from '../types/TerminationReason.js';
import type { LambdaErrorCategory } from '../types/LambdaErrorCategory.js';

/** Outcome fields surfaced by the parse step. */
export interface LambdaResultInfo {
  readonly errorCount: number;
  readonly category: LambdaErrorCategory;
  readonly requestId?: string;
  readonly runtimeStatus?: string;
  readonly durationMs?: number;
  readonly memorySizeMb?: number;
  readonly maxMemoryUsedMb?: number;
  readonly downstreamTarget?: string;
}

/** Termination payload rendered by the closing summary. */
export interface LambdaTermination {
  readonly reason: TerminationReason;
  readonly matchedCaseIds: ReadonlyArray<string>;
  readonly category?: string;
  readonly downstreamTarget?: string;
  readonly errorMessage?: string;
  readonly requestId?: string;
}

/**
 * Renders the Lambda analysis flow as a structured, human-readable
 * narrative on the runbook logger. Mirrors `apigw.ApiGwReporter`.
 */
export class LambdaReporter {
  constructor(private readonly logger: GOLogger) {}

  sectionPrepare(lambdaName: string, logGroup: string, eventSource?: string): void {
    this.logger.newline();
    this.logger.text('═══ Preparazione: query Lambda ═══');
    this.logger.text(
      `  ├─ Lambda: ${lambdaName}${eventSource !== undefined && eventSource !== '' ? `  (eventSource: ${eventSource})` : ''}`,
    );
    this.logger.text(`  └─ Log group: ${logGroup}`);
  }

  lambdaResult(info: LambdaResultInfo): void {
    this.logger.text(`  ├─ Errori individuati: ${info.errorCount}`);
    this.logger.text(`  ├─ Categoria: ${info.category}`);
    if (info.runtimeStatus !== undefined && info.runtimeStatus !== '') {
      const memory =
        info.maxMemoryUsedMb !== undefined && info.memorySizeMb !== undefined
          ? `, Memory ${info.maxMemoryUsedMb}/${info.memorySizeMb} MB`
          : '';
      const duration = info.durationMs !== undefined ? `Duration ${info.durationMs} ms` : '';
      const detail = [duration, memory].filter((part) => part !== '').join('');
      this.logger.text(
        `  ├─ Runtime status: ${info.runtimeStatus}${detail !== '' ? ` (${detail.replace(/^, /, '')})` : ''}`,
      );
    }
    if (info.downstreamTarget !== undefined && info.downstreamTarget !== '') {
      this.logger.text(`  ├─ Downstream individuato: ${info.downstreamTarget}`);
    }
    if (info.requestId !== undefined && info.requestId !== '') {
      this.logger.text(`  └─ requestId: ${info.requestId}`);
    } else {
      this.logger.text(`  └─ requestId: non disponibile`);
    }
  }

  invocation(requestId: string, logCount: number): void {
    this.logger.newline();
    this.logger.text('═══ Flusso invocazione (per requestId) ═══');
    this.logger.text(`  ├─ Query CloudWatch [filter: ${requestId}]`);
    this.logger.text(`  └─ Log trovati: ${logCount}`);
  }

  downstream(name: string, logGroup: string, logCount: number): void {
    this.logger.newline();
    this.logger.text(`═══ Downstream: ${name} ═══`);
    this.logger.text(`  ├─ Log group: ${logGroup}`);
    this.logger.text(`  └─ Log trovati: ${logCount}`);
  }

  queryFailed(logGroups: ReadonlyArray<string>, errorMessage: string): void {
    this.logger.text(`  └─ ⚠ Query fallita`);
    if (logGroups.length > 0) {
      this.logger.text(`     ├─ Log group${logGroups.length === 1 ? '' : 's'}: ${logGroups.join(', ')}`);
    }
    this.logger.text(`     └─ Causa: ${errorMessage}`);
  }

  stopSummary(termination: LambdaTermination): void {
    this.logger.newline();
    this.logger.text('═══ Esecuzione terminata ═══');
    if (termination.category !== undefined && termination.category !== '') {
      this.logger.text(`  ├─ Categoria errore: ${termination.category}`);
    }
    switch (termination.reason) {
      case 'known-case':
        if (termination.matchedCaseIds.length <= 1) {
          this.logger.text(
            `  └─ Esito: caso noto${termination.matchedCaseIds[0] !== undefined ? ` (${termination.matchedCaseIds[0]})` : ''}`,
          );
        } else {
          this.logger.text(`  ├─ Casi noti rilevati: ${termination.matchedCaseIds.length}`);
          termination.matchedCaseIds.forEach((id, idx) => {
            const isLast = idx === termination.matchedCaseIds.length - 1;
            const branch = isLast ? '└─' : '├─';
            const tag = idx === 0 ? ' ← primario' : '';
            this.logger.text(`  │    ${branch} ${id}${tag}`);
          });
        }
        break;
      case 'downstream':
        this.logger.text(`  ├─ Esito: errore downstream (${termination.downstreamTarget ?? 'n/a'})`);
        this.logger.text(
          `  └─ ${termination.errorMessage !== undefined && termination.errorMessage !== '' ? `Errore: ${termination.errorMessage}` : 'Nessun error message disponibile'}`,
        );
        break;
      case 'no-errors':
        this.logger.text(`  └─ Esito: nessun errore individuato nella finestra temporale`);
        break;
      case 'no-match':
        this.logger.text(`  ├─ Esito: caso non riconosciuto`);
        this.logger.text(
          `  └─ ${termination.errorMessage !== undefined && termination.errorMessage !== '' ? `Errore più rappresentativo: ${termination.errorMessage}` : 'Nessun error message disponibile'}`,
        );
        break;
      default: {
        const exhaustive: never = termination.reason;
        throw new Error(`Unknown TerminationReason: ${String(exhaustive)}`);
      }
    }
  }
}
