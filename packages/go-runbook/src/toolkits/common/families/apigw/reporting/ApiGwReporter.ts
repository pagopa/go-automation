import type { TreeNode } from '@pagopa/go-common/render';

import type { RunbookReporter } from '../../../../../engine/reporting/RunbookReporter.js';

/**
 * Renders the API Gateway analysis flow as a structured, human-readable
 * narrative on the runbook logger.
 *
 * The reporter has no internal state beyond the logger reference — the
 * dynamic flow is driven by the engine, the reporter only formats the
 * events the steps emit.
 *
 * Output style: box-drawing characters (`═ ├ │ └`) to keep the
 * hierarchy visible in modern terminals while staying monospaced.
 */
export class ApiGwReporter {
  constructor(protected readonly reporter: RunbookReporter) {}

  /**
   * Section header for the API Gateway preparation step (query +
   * trace-id extraction).
   */
  sectionPrepare(logGroup: string): void {
    this.reporter.section('Preparazione: query API Gateway');
    this.reporter.add({ label: `Log group: ${logGroup}` });
  }

  /**
   * Outcome of the API Gateway query: number of errors, trace id and
   * the diagnostic fields extracted from the first error row
   * (`errorMessage`, `path`, `httpMethod`). These fields often contain
   * the only evidence available when the downstream microservice
   * returns 0 logs (e.g. `Endpoint request timed out`).
   */
  apiGwResult(args: {
    readonly errorCount: number;
    readonly statusCode: string;
    /**
     * Valore del trace id del prodotto. SEND: X-Ray trace id; INTEROP:
     * correlation id. Il significato esatto è veicolato da
     * {@link traceIdLabel}.
     */
    readonly traceId: string | undefined;
    /**
     * Label human-friendly da mostrare in console (es. `'X-Ray Trace ID'`
     * per SEND, `'Correlation ID (cid)'` per INTEROP). Quando omessa, la
     * label di default è `'Trace ID'`.
     */
    readonly traceIdLabel?: string;
    readonly errorMessage?: string;
    readonly path?: string;
    readonly httpMethod?: string;
  }): void {
    this.reporter.add({ label: `Errori HTTP individuati: ${args.errorCount} (status ${args.statusCode || 'n/a'})` });

    const method =
      args.httpMethod !== undefined && args.httpMethod !== '' && args.httpMethod !== '-' ? args.httpMethod : '';
    const path = args.path !== undefined && args.path !== '' && args.path !== '-' ? args.path : '';
    if (method !== '' || path !== '') {
      const label = method !== '' && path !== '' ? `${method} ${path}` : method !== '' ? method : path;
      this.reporter.add({ label: `Endpoint: ${label}` });
    }

    if (args.errorMessage !== undefined && args.errorMessage !== '' && args.errorMessage !== '-') {
      this.reporter.add({ label: `Error message API GW: ${args.errorMessage}` });
    }

    const traceLabel = args.traceIdLabel ?? 'Trace ID';
    if (args.traceId !== undefined && args.traceId !== '') {
      this.reporter.add({ label: `${traceLabel}: ${args.traceId}` });
    } else {
      this.reporter.add({ label: `${traceLabel}: non disponibile` });
    }
  }

  apiGwAuthorizerEvaluation(args: {
    readonly lambdaName: string;
    readonly authorizerStatus?: string;
    readonly authorizerLatencyMs?: number;
    readonly authorizerRequestId?: string;
    readonly timeoutMs?: number;
    readonly path?: string;
    readonly httpMethod?: string;
    readonly outcome: 'none' | 'timeout' | 'error';
    readonly failureType?: string;
  }): void {
    this.reporter.section('Verifica Lambda authorizer API Gateway');
    this.reporter.add({ label: `Lambda: ${args.lambdaName}` });
    this.reporter.add({ label: `authorizerStatus: ${formatOptional(args.authorizerStatus)}` });
    this.reporter.add({ label: `authorizerLatency: ${formatLatency(args.authorizerLatencyMs)}` });
    this.reporter.add({ label: `authorizerRequestId: ${formatOptional(args.authorizerRequestId)}` });
    if (args.timeoutMs !== undefined) {
      this.reporter.add({ label: `timeout configurato: ${args.timeoutMs} ms` });
    }

    const method = args.httpMethod !== undefined && args.httpMethod !== '' ? args.httpMethod : '';
    const path = args.path !== undefined && args.path !== '' ? args.path : '';
    if (method !== '' || path !== '') {
      const label = method !== '' && path !== '' ? `${method} ${path}` : method !== '' ? method : path;
      this.reporter.add({ label: `Endpoint: ${label}` });
    }

    const outcome =
      args.outcome === 'none'
        ? 'nessun errore authorizer'
        : args.outcome === 'timeout'
          ? 'timeout authorizer'
          : 'errore authorizer';
    this.reporter.add({ label: `Esito: ${outcome}` });
  }

  apiGwExecutionLogQuery(
    logGroup: string,
    requestIds: ReadonlyArray<{ readonly path: string; readonly requestId: string }>,
  ): void {
    this.reporter.add({
      label: 'errorMessage API Gateway valorizzato: query execution log',
      children: [
        { label: `Log group: ${logGroup}` },
        {
          label: `RequestId da analizzare: ${requestIds.length}`,
          children: requestIds.map((request) => ({ label: `${request.path}: ${request.requestId}` })),
        },
      ],
    });
  }

  apiGwExecutionLogResult(logCount: number): void {
    this.reporter.add({ label: `Execution log trovati: ${logCount}` });
  }

  sectionApiGwExecutionLog(): void {
    this.reporter.section('Verifica execution log API Gateway');
  }

  /** Reports that the execution-log query was skipped before reaching AWS. */
  apiGwExecutionLogSkipped(logGroup: string, reason: string): void {
    this.reporter.add({
      label: '⚠ Query execution log non eseguita',
      children: [{ label: `Log group: ${logGroup}` }, { label: `Causa: ${reason}` }],
    });
  }

  /**
   * Reports that the latest CloudWatch query attempt **failed** — the
   * AWS call threw (typically a `ResourceNotFoundException` on a
   * misconfigured log group, or a transient throttling / IAM error).
   *
   * Renders a dedicated `⚠ Query fallita` banner so the failure is
   * immediately visible in the structured output instead of being
   * buried in the trace JSON. The engine continues with its normal
   * failure handling (decide step closes the visit, fallback action
   * runs at the end).
   */
  queryFailed(logGroups: ReadonlyArray<string>, errorMessage: string): void {
    const children: TreeNode[] = [];
    if (logGroups.length > 0) {
      children.push({ label: `Log group${logGroups.length === 1 ? '' : 's'}: ${logGroups.join(', ')}` });
    }
    children.push({ label: `Causa: ${errorMessage}` });
    this.reporter.add({ label: '⚠ Query fallita', children });
  }
}

function formatOptional(value: string | undefined): string {
  if (value === undefined || value.trim() === '' || value.trim() === '-') return 'non disponibile';
  return value;
}

function formatLatency(value: number | undefined): string {
  return value === undefined ? 'non disponibile' : `${value} ms`;
}
