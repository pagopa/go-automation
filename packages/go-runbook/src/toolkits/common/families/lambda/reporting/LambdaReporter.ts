import type { TreeNode } from '@pagopa/go-common/render';
import type { RunbookReporter } from '../../../../../engine/index.js';
import { queryFailedNode } from '../../../reporting/queryFailedNode.js';
import type { LambdaResultInfo } from './LambdaResultInfo.js';

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
    this.reporter.section('Preparazione: query Lambda');
    this.reporter.add(
      { label: `Lambda: ${lambdaName}${present(eventSource) ? `  (eventSource: ${eventSource})` : ''}` },
      { label: `Log group: ${logGroup}` },
    );
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
    this.reporter.add(...nodes);
  }

  invocation(requestId: string, logCount: number): void {
    this.reporter.section('Flusso invocazione (per requestId)');
    this.reporter.add({ label: `Query CloudWatch [filter: ${requestId}]` }, { label: `Log trovati: ${logCount}` });
  }

  downstream(logGroup: string, logCount: number): void {
    this.reporter.add({ label: `Log group: ${logGroup}` }, { label: `Log trovati: ${logCount}` });
  }

  queryFailed(logGroups: ReadonlyArray<string>, errorMessage: string): void {
    this.reporter.add(queryFailedNode(logGroups, errorMessage));
  }
}
