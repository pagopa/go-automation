import type { RunbookReporter } from '../../../../../engine/index.js';
import { queryFailedNode } from '../../../reporting/queryFailedNode.js';
import { normalizeOutputValue } from '../../../output/outputValues.js';
import type { ApiGwAuthorizerReporterInput } from './ApiGwAuthorizerReporterInput.js';

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
    this.reporter.section('Richiesta API Gateway');
    this.reporter.add({ label: `Errori HTTP individuati: ${args.errorCount} (status ${args.statusCode || 'n/a'})` });

    this.endpoint(args.httpMethod, args.path);

    const errorMessage = normalizeOutputValue(args.errorMessage);
    if (errorMessage !== undefined) {
      this.reporter.add({ label: `Error message API GW: ${errorMessage}` });
    }

    const traceLabel = args.traceIdLabel ?? 'Trace ID';
    if (args.traceId !== undefined && args.traceId !== '') {
      this.reporter.add({ label: `${traceLabel}: ${args.traceId}` });
    } else {
      this.reporter.add({ label: `${traceLabel}: non disponibile` });
    }
  }

  apiGwAuthorizerEvaluation(args: ApiGwAuthorizerReporterInput): void {
    this.reporter.section('Verifica Lambda authorizer API Gateway');
    this.reporter.add({ label: `Lambda: ${args.lambdaName}` });
    this.reporter.add({ label: `authorizerStatus: ${formatOptional(args.authorizerStatus)}` });
    this.reporter.add({ label: `authorizerLatency: ${formatLatency(args.authorizerLatencyMs)}` });
    this.reporter.add({ label: `authorizerRequestId: ${formatOptional(args.authorizerRequestId)}` });
    if (args.timeoutMs !== undefined) {
      this.reporter.add({ label: `timeout configurato: ${args.timeoutMs} ms` });
    }

    this.endpoint(args.httpMethod, args.path);

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
    this.reporter.add(queryFailedNode(logGroups, errorMessage));
  }

  /** The endpoint line, when the request has a method or a path. */
  private endpoint(httpMethod: string | undefined, path: string | undefined): void {
    const label = [normalizeOutputValue(httpMethod), normalizeOutputValue(path)]
      .filter((part) => part !== undefined)
      .join(' ');
    if (label !== '') this.reporter.add({ label: `Endpoint: ${label}` });
  }
}

function formatOptional(value: string | undefined): string {
  return normalizeOutputValue(value) ?? 'non disponibile';
}

function formatLatency(value: number | undefined): string {
  return value === undefined ? 'non disponibile' : `${value} ms`;
}
