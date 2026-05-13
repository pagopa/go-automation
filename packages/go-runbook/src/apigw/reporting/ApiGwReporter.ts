import type { GOLogger } from '@go-automation/go-common/core';
import type { TerminationReason } from '../types/TerminationReason.js';

/**
 * Input expected by {@link renderApiGwFinalSummary}.
 *
 * The consumer script collects these fields from the result returned by
 * `RunbookEngine.execute` (matched case, final context vars) so the
 * closing banner reflects the **actual** outcome of the runbook — not
 * just the local view of the last `decide-<service>` step.
 */
export interface ApiGwFinalSummaryInput {
  /** Logger used to emit the structured banner. */
  readonly logger: GOLogger;
  /**
   * IDs of the known cases the engine ultimately matched (either via
   * early resolution or via the post-loop case match), sorted by
   * priority descending (`matchedCaseIds[0]` is the primary). Empty
   * array when no case matched.
   */
  readonly matchedCaseIds: ReadonlyArray<string>;
  /** Read-only snapshot of `finalContext.vars`. */
  readonly vars: ReadonlyMap<string, string>;
}

/**
 * Renders the closing "Esecuzione terminata" banner.
 *
 * Reads `terminationReason`, `downstreamTarget`, `lastErrorMsg` and
 * `apiGwServicesVisited` from the final context vars and combines them
 * with the engine's `matchedCase` to produce a banner that is always
 * consistent with the runbook's real outcome.
 *
 * @param input - Fields collected from the engine result
 */
export function renderApiGwFinalSummary(input: ApiGwFinalSummaryInput): void {
  const servicesVisited = parseVisitedChain(input.vars.get('apiGwServicesVisited'));
  const lastErrorMsg = (input.vars.get('lastErrorMsg') ?? '').trim();
  const terminationReason = (input.vars.get('terminationReason') ?? '').trim() as TerminationReason | '';
  const downstreamTarget = (input.vars.get('downstreamTarget') ?? '').trim();

  // Fall back to the API Gateway evidence when no microservice produced
  // a representative error message: a 0-log entry service still leaves
  // useful information on the API GW row (`Endpoint request timed out`,
  // path, method) that we want to surface.
  const apiGwErrorMessage = sanitizeApiGwField(input.vars.get('apiGwErrorMessage'));
  const apiGwPath = sanitizeApiGwField(input.vars.get('apiGwPath'));
  const apiGwHttpMethod = sanitizeApiGwField(input.vars.get('apiGwHttpMethod'));

  let errorMessage = lastErrorMsg;
  if (errorMessage === '' && apiGwErrorMessage !== '') {
    const endpoint =
      apiGwHttpMethod !== '' && apiGwPath !== ''
        ? ` [${apiGwHttpMethod} ${apiGwPath}]`
        : apiGwPath !== ''
          ? ` [path: ${apiGwPath}]`
          : '';
    errorMessage = `${apiGwErrorMessage}${endpoint}`;
  }

  // The engine's matched cases win over the local decide-step verdict:
  // a known case may have matched on absence (e.g. `LogCount == '0'`)
  // even when decide had no positive signal to report.
  const reason: TerminationReason =
    input.matchedCaseIds.length > 0 ? 'known-case' : terminationReason !== '' ? terminationReason : 'no-match';

  new ApiGwReporter(input.logger).stopSummary({
    reason,
    matchedCaseIds: input.matchedCaseIds,
    ...(downstreamTarget !== '' ? { downstreamTarget } : {}),
    ...(errorMessage !== '' ? { errorMessage } : {}),
    servicesVisited,
  });
}

/**
 * Trims and discards the literal `-` placeholder that API Gateway uses
 * for "field not present".
 */
function sanitizeApiGwField(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim();
  return trimmed === '-' ? '' : trimmed;
}

function parseVisitedChain(raw: string | undefined): ReadonlyArray<ApiGwReporterServiceSummary> {
  if (raw === undefined || raw.trim() === '') return [];
  const out: ApiGwReporterServiceSummary[] = [];
  for (const entry of raw.split(',')) {
    const [name, countStr] = entry.split('|');
    if (name === undefined || name === '') continue;
    const logCount = Number(countStr ?? '0');
    out.push({ name, logCount: Number.isFinite(logCount) ? logCount : 0 });
  }
  return out;
}

/**
 * Snapshot of an analysed service for the closing summary.
 */
export interface ApiGwReporterServiceSummary {
  readonly name: string;
  readonly logCount: number;
}

/**
 * Termination payload assembled by `DecideNextStep` and rendered by the
 * reporter once the analysis loop exits.
 */
export interface ApiGwReporterTermination {
  readonly reason: TerminationReason;
  /**
   * IDs of every known case the engine matched, sorted by priority
   * descending (`matchedCaseIds[0]` is the primary). Empty when the
   * termination is not a `known-case`.
   */
  readonly matchedCaseIds: ReadonlyArray<string>;
  readonly downstreamTarget?: string;
  readonly errorMessage?: string;
  readonly servicesVisited: ReadonlyArray<ApiGwReporterServiceSummary>;
}

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
  constructor(private readonly logger: GOLogger) {}

  /**
   * Section header for the API Gateway preparation step (query +
   * trace-id extraction).
   */
  sectionPrepare(logGroup: string): void {
    this.logger.newline();
    this.logger.text('═══ Preparazione: query API Gateway ═══');
    this.logger.text(`  ├─ Log group: ${logGroup}`);
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
    readonly xRayTraceId: string | undefined;
    readonly errorMessage?: string;
    readonly path?: string;
    readonly httpMethod?: string;
  }): void {
    this.logger.text(`  ├─ Errori HTTP individuati: ${args.errorCount} (status ${args.statusCode || 'n/a'})`);

    const method =
      args.httpMethod !== undefined && args.httpMethod !== '' && args.httpMethod !== '-' ? args.httpMethod : '';
    const path = args.path !== undefined && args.path !== '' && args.path !== '-' ? args.path : '';
    if (method !== '' || path !== '') {
      const label = method !== '' && path !== '' ? `${method} ${path}` : method !== '' ? method : path;
      this.logger.text(`  ├─ Endpoint: ${label}`);
    }

    if (args.errorMessage !== undefined && args.errorMessage !== '' && args.errorMessage !== '-') {
      this.logger.text(`  ├─ Error message API GW: ${args.errorMessage}`);
    }

    if (args.xRayTraceId !== undefined && args.xRayTraceId !== '') {
      this.logger.text(`  └─ XRay Trace Id: ${args.xRayTraceId}`);
    } else {
      this.logger.text(`  └─ XRay Trace Id: non disponibile`);
    }
  }

  /**
   * Section header for a single service visit.
   *
   * @param visitNumber - 1-based progressive index of the visit
   * @param serviceName - canonical service name
   * @param entry - true when this is the entry-point service
   * @param logGroups - CloudWatch log groups scanned for this visit
   */
  sectionService(visitNumber: number, serviceName: string, entry: boolean, logGroups: ReadonlyArray<string>): void {
    this.logger.newline();
    const tag = entry ? ' (entry)' : '';
    this.logger.text(`═══ Servizio ${visitNumber}: ${serviceName}${tag} ═══`);
    if (logGroups.length > 0) {
      this.logger.text(`  ├─ Log group: ${logGroups.join(', ')}`);
    }
  }

  /**
   * Reports a CloudWatch query executed on the current service.
   */
  query(queryNumber: number, identifiers: ReadonlyArray<string>): void {
    const idList = identifiers.length === 0 ? 'nessun identificatore' : identifiers.join(' OR ');
    this.logger.text(`  ├─ Query CloudWatch ${queryNumber} [filter: ${idList}]`);
  }

  /**
   * Reports the number of log rows returned by the last query.
   */
  queryResult(logCount: number): void {
    this.logger.text(`  │    └─ ${logCount} log trovati`);
  }

  /**
   * Reports analysis findings on the rows just returned.
   */
  analysisFindings(args: {
    readonly errorMessageLen: number;
    readonly knownUrl?: { readonly observedUrl: string; readonly target: string };
    readonly fallbackUuid?: string;
  }): void {
    this.logger.text(`  ├─ Analisi log`);
    if (args.errorMessageLen > 0) {
      this.logger.text(`  │    ├─ Error message individuato (len=${args.errorMessageLen})`);
    } else {
      this.logger.text(`  │    ├─ Nessun error message rilevato`);
    }
    if (args.knownUrl !== undefined) {
      this.logger.text(`  │    ├─ KnownUrl rilevato → target: ${args.knownUrl.target}`);
      this.logger.text(`  │    │   URL: ${args.knownUrl.observedUrl}`);
    }
    if (args.fallbackUuid !== undefined) {
      this.logger.text(`  │    └─ FALLBACK-UUID estratto: ${args.fallbackUuid}`);
    } else {
      this.logger.text(`  │    └─ Nessun FALLBACK-UUID nuovo`);
    }
  }

  /**
   * Reports the decision taken for the current service.
   */
  decisionKnownCase(caseId: string): void {
    this.logger.text(`  └─ Match caso noto: ${caseId}`);
  }

  decisionGoToService(target: string): void {
    this.logger.text(`  └─ Prosegue con il servizio: ${target}`);
  }

  decisionExternalDownstream(target: string): void {
    this.logger.text(`  └─ URL downstream individuato (${target}) — analisi terminata`);
  }

  decisionFallbackRetry(serviceName: string): void {
    this.logger.text(`  └─ Riprova ${serviceName} con FALLBACK-UUID`);
  }

  /**
   * Reports the discovery of an alternative `trace_id` in the rows of a
   * fallback-uuid query: the analysis loop swaps `xRayTraceId` with the
   * newly observed value and re-queries the same service.
   *
   * @param serviceName - Service that will be re-queried with the swap
   * @param newTraceId  - Canonical X-Ray trace id used from now on
   */
  decisionTraceIdSwap(serviceName: string, newTraceId: string): void {
    this.logger.text(`  ├─ trace_id rilevato nei log → swap di xRayTraceId`);
    this.logger.text(`  │    └─ Nuovo trace: ${newTraceId}`);
    this.logger.text(`  └─ Riprova ${serviceName} con il nuovo trace_id`);
  }

  decisionNoMatch(): void {
    this.logger.text(`  └─ Nessun KnownUrl in questo servizio, nessun FALLBACK-UUID nuovo`);
  }

  decisionLoopDetected(target: string): void {
    this.logger.text(`  └─ Loop rilevato (${target} già visitato con gli stessi identificatori)`);
  }

  /**
   * Closing summary printed once the analysis loop exits.
   */
  stopSummary(t: ApiGwReporterTermination): void {
    this.logger.newline();
    this.logger.text('═══ Esecuzione terminata ═══');
    const chain = t.servicesVisited.map((s) => `${s.name} (${s.logCount} log)`).join(' → ');
    this.logger.text(`  ├─ Servizi analizzati: ${t.servicesVisited.length}${chain ? ` — ${chain}` : ''}`);
    switch (t.reason) {
      case 'known-case':
        if (t.matchedCaseIds.length === 0) {
          this.logger.text(`  └─ Esito: caso noto`);
        } else if (t.matchedCaseIds.length === 1) {
          this.logger.text(`  └─ Esito: caso noto (${t.matchedCaseIds[0]})`);
        } else {
          this.logger.text(`  ├─ Casi noti rilevati: ${t.matchedCaseIds.length}`);
          t.matchedCaseIds.forEach((id, idx) => {
            const isLast = idx === t.matchedCaseIds.length - 1;
            const branch = isLast ? '└─' : '├─';
            const tag = idx === 0 ? ' ← primario' : '';
            this.logger.text(`  │    ${branch} ${id}${tag}`);
          });
          this.logger.text(`  └─ (le action sono state eseguite tutte in ordine di priority desc)`);
        }
        break;
      case 'external-downstream':
        this.logger.text(`  ├─ Esito: URL downstream (${t.downstreamTarget ?? 'n/a'})`);
        if (t.errorMessage !== undefined && t.errorMessage !== '') {
          this.logger.text(`  └─ Errore: ${t.errorMessage}`);
        } else {
          this.logger.text(`  └─ Nessun error message disponibile`);
        }
        break;
      case 'no-match':
        this.logger.text(`  ├─ Esito: caso non riconosciuto`);
        if (t.errorMessage !== undefined && t.errorMessage !== '') {
          this.logger.text(`  └─ Errore più rappresentativo: ${t.errorMessage}`);
        } else {
          this.logger.text(`  └─ Nessun error message disponibile`);
        }
        break;
      case 'loop-detected':
        this.logger.text(`  └─ Esito: loop rilevato — analisi interrotta`);
        break;
      default: {
        const _exhaustive: never = t.reason;
        throw new Error(`Unknown TerminationReason: ${String(_exhaustive)}`);
      }
    }
  }
}
