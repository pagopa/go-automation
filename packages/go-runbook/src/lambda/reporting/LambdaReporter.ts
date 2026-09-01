import type { TreeNode } from '@go-automation/go-common/core';

import type { RunbookReporter } from '../../services/RunbookReporter.js';
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

/** True when an optional string carries something to print. */
function present(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

/**
 * Renders the Lambda analysis flow as a structured, human-readable
 * narrative on the runbook logger. Mirrors `apigw.ApiGwReporter`.
 *
 * Every method describes the *shape* of the output as {@link TreeNode}s and
 * hands it to the {@link RunbookReporter}: branch characters, indentation and
 * the moment of printing are decided there.
 */
export class LambdaReporter {
  constructor(private readonly reporter: RunbookReporter) {}

  sectionPrepare(lambdaName: string, logGroup: string, eventSource?: string): void {
    this.section('Preparazione: query Lambda');
    this.tree([
      { label: `Lambda: ${lambdaName}${present(eventSource) ? `  (eventSource: ${eventSource})` : ''}` },
      { label: `Log group: ${logGroup}` },
    ]);
  }

  lambdaResult(info: LambdaResultInfo): void {
    const nodes: TreeNode[] = [
      { label: `Errori individuati: ${info.errorCount}` },
      { label: `Categoria: ${info.category}` },
    ];
    if (present(info.runtimeStatus)) {
      const memory =
        info.maxMemoryUsedMb !== undefined && info.memorySizeMb !== undefined
          ? `Memory ${info.maxMemoryUsedMb}/${info.memorySizeMb} MB`
          : '';
      const duration = info.durationMs !== undefined ? `Duration ${info.durationMs} ms` : '';
      const detail = [duration, memory].filter((part) => part !== '').join(', ');
      nodes.push({ label: `Runtime status: ${info.runtimeStatus}${detail !== '' ? ` (${detail})` : ''}` });
    }
    if (present(info.downstreamTarget)) {
      nodes.push({ label: `Downstream individuato: ${info.downstreamTarget}` });
    }
    nodes.push({ label: `requestId: ${present(info.requestId) ? info.requestId : 'non disponibile'}` });
    this.tree(nodes);
  }

  invocation(requestId: string, logCount: number): void {
    this.section('Flusso invocazione (per requestId)');
    this.tree([{ label: `Query CloudWatch [filter: ${requestId}]` }, { label: `Log trovati: ${logCount}` }]);
  }

  downstream(name: string, logGroup: string, logCount: number): void {
    this.section(`Downstream: ${name}`);
    this.tree([{ label: `Log group: ${logGroup}` }, { label: `Log trovati: ${logCount}` }]);
  }

  queryFailed(logGroups: ReadonlyArray<string>, errorMessage: string): void {
    const children: TreeNode[] = [];
    if (logGroups.length > 0) {
      children.push({ label: `Log group${logGroups.length === 1 ? '' : 's'}: ${logGroups.join(', ')}` });
    }
    children.push({ label: `Causa: ${errorMessage}` });
    this.tree([{ label: '\u26a0 Query fallita', children }]);
  }

  stopSummary(termination: LambdaTermination): void {
    this.section('Esecuzione terminata');
    const nodes: TreeNode[] = [];
    if (present(termination.category)) {
      nodes.push({ label: `Categoria errore: ${termination.category}` });
    }
    const ids = termination.matchedCaseIds;
    switch (termination.reason) {
      case 'known-case':
        nodes.push(
          ids.length <= 1
            ? { label: `Esito: caso noto${ids[0] !== undefined ? ` (${ids[0]})` : ''}` }
            : {
                label: `Casi noti rilevati: ${ids.length}`,
                children: ids.map((id, index) => ({ label: `${id}${index === 0 ? ' \u2190 primario' : ''}` })),
              },
        );
        break;
      case 'downstream':
        nodes.push(
          { label: `Esito: errore downstream (${termination.downstreamTarget ?? 'n/a'})` },
          {
            label: present(termination.errorMessage)
              ? `Errore: ${termination.errorMessage}`
              : 'Nessun error message disponibile',
          },
        );
        break;
      case 'no-errors':
        nodes.push({ label: 'Esito: nessun errore individuato nella finestra temporale' });
        break;
      case 'no-match':
        nodes.push(
          { label: 'Esito: caso non riconosciuto' },
          {
            label: present(termination.errorMessage)
              ? `Errore pi\u00f9 rappresentativo: ${termination.errorMessage}`
              : 'Nessun error message disponibile',
          },
        );
        break;
      default: {
        const exhaustive: never = termination.reason;
        throw new Error(`Unknown TerminationReason: ${String(exhaustive)}`);
      }
    }
    this.tree(nodes);
  }

  private section(title: string): void {
    this.reporter.section(title);
  }

  private tree(nodes: ReadonlyArray<TreeNode>): void {
    this.reporter.add(...nodes);
  }
}
