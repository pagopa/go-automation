import type { TreeNode } from '@pagopa/go-common/render';
import { ApiGwReporter } from '../../../../common/families/apigw/reporting/ApiGwReporter.js';
import type { ApiGwReporterTermination } from './ApiGwReporterTermination.js';

/**
 * Narrative of the SEND API Gateway pipeline: the generic API Gateway events,
 * plus the walk along the chain of services (visits, queries, findings,
 * decisions and the closing summary).
 */
export class ApiGwServiceChainReporter extends ApiGwReporter {
  /**
   * Section header for a single service visit.
   *
   * @param visitNumber - 1-based progressive index of the visit
   * @param serviceName - canonical service name
   * @param entry - true when this is the entry-point service
   * @param logGroups - CloudWatch log groups scanned for this visit
   */
  sectionService(visitNumber: number, serviceName: string, entry: boolean, logGroups: ReadonlyArray<string>): void {
    const tag = entry ? ' (entry)' : '';
    this.reporter.section(`Servizio ${visitNumber}: ${serviceName}${tag}`);
    if (logGroups.length > 0) {
      this.reporter.add({ label: `Log group: ${logGroups.join(', ')}` });
    }
  }

  /**
   * Reports a CloudWatch query executed on the current service.
   */
  query(queryNumber: number, identifiers: ReadonlyArray<string>): void {
    const idList = identifiers.length === 0 ? 'nessun identificatore' : identifiers.join(' OR ');
    this.reporter.add({ label: `Query CloudWatch ${queryNumber} [filter: ${idList}]` });
  }

  /**
   * Reports the number of log rows returned by the last query.
   */
  queryResult(logCount: number): void {
    this.reporter.add({ label: `${logCount} log trovati` });
  }

  /**
   * Reports analysis findings on the rows just returned.
   */
  analysisFindings(args: {
    readonly errorMessageLen: number;
    readonly knownUrl?: { readonly observedUrl: string; readonly target: string };
    readonly fallbackUuid?: string;
  }): void {
    const findings: TreeNode[] = [
      {
        label:
          args.errorMessageLen > 0
            ? `Error message individuato (len=${args.errorMessageLen})`
            : 'Nessun error message rilevato',
      },
    ];
    if (args.knownUrl !== undefined) {
      findings.push({
        label: `KnownUrl rilevato → target: ${args.knownUrl.target}`,
        children: [{ label: `URL: ${args.knownUrl.observedUrl}` }],
      });
    }
    findings.push({
      label:
        args.fallbackUuid !== undefined ? `FALLBACK-UUID estratto: ${args.fallbackUuid}` : 'Nessun FALLBACK-UUID nuovo',
    });
    this.reporter.add({ label: 'Analisi log', children: findings });
  }

  /**
   * Reports the decision taken for the current service.
   */
  decisionKnownCase(caseId: string): void {
    this.reporter.add({ label: `Match caso noto: ${caseId}` });
  }

  decisionGoToService(target: string): void {
    this.reporter.add({ label: `Prosegue con il servizio: ${target}` });
  }

  decisionExternalDownstream(target: string): void {
    this.reporter.add({ label: `URL downstream individuato (${target}) — analisi terminata` });
  }

  decisionFallbackRetry(serviceName: string): void {
    this.reporter.add({ label: `Riprova ${serviceName} con FALLBACK-UUID` });
  }

  /**
   * Reports the discovery of an alternative `trace_id` in the rows of a
   * fallback-uuid query: the analysis loop swaps `xRayTraceId` with the
   * newly observed value and re-queries the same service.
   *
   * @param serviceName  - Service that will be re-queried with the swap
   * @param rawTraceId   - Raw 32-hex token as observed in the log row
   * @param newTraceId   - Canonical X-Ray form used from now on
   */
  decisionTraceIdSwap(serviceName: string, rawTraceId: string, newTraceId: string): void {
    this.reporter.add({
      label: 'trace_id rilevato nei log → swap di xRayTraceId',
      children:
        rawTraceId === newTraceId
          ? // Already in canonical form — no transformation was applied.
            [{ label: `Nuovo trace (già canonical): ${newTraceId}` }]
          : [{ label: `Originale: ${rawTraceId}` }, { label: `Nuovo trace: ${newTraceId}` }],
    });
    this.reporter.add({ label: `Riprova ${serviceName} con il nuovo trace_id` });
  }

  decisionNoMatch(): void {
    this.reporter.add({ label: `Nessun KnownUrl in questo servizio, nessun FALLBACK-UUID nuovo` });
  }

  decisionLoopDetected(target: string): void {
    this.reporter.add({ label: `Loop rilevato (${target} già visitato con gli stessi identificatori)` });
  }

  /**
   * Closing summary printed once the analysis loop exits.
   */
  stopSummary(t: ApiGwReporterTermination): void {
    this.reporter.section('Esecuzione terminata');
    const chain = t.servicesVisited.map((s) => `${s.name} (${s.logCount} log)`).join(' → ');
    this.reporter.add({ label: `Servizi analizzati: ${t.servicesVisited.length}${chain ? ` — ${chain}` : ''}` });
    switch (t.reason) {
      case 'known-case':
        if (t.matchedCaseIds.length === 0) {
          this.reporter.add({ label: `Esito: caso noto` });
        } else if (t.matchedCaseIds.length === 1) {
          this.reporter.add({ label: `Esito: caso noto (${t.matchedCaseIds[0]})` });
        } else {
          this.reporter.add({
            label: `Casi noti rilevati: ${t.matchedCaseIds.length}`,
            children: t.matchedCaseIds.map((id, index) => ({ label: `${id}${index === 0 ? ' ← primario' : ''}` })),
          });
          this.reporter.add({
            label: `(eseguita solo l'action del caso primario; gli altri sono informativi nel trace)`,
          });
        }
        break;
      case 'external-downstream':
        this.reporter.add({ label: `Esito: URL downstream (${t.downstreamTarget ?? 'n/a'})` });
        if (t.errorMessage !== undefined && t.errorMessage !== '') {
          this.reporter.add({ label: `Errore: ${t.errorMessage}` });
        } else {
          this.reporter.add({ label: `Nessun error message disponibile` });
        }
        break;
      case 'api-gw-execution-log-unresolved':
        this.reporter.add({ label: `Esito: caso non riconosciuto negli execution log API Gateway` });
        if (t.errorMessage !== undefined && t.errorMessage !== '') {
          this.reporter.add({ label: `Dettaglio: ${t.errorMessage}` });
        } else {
          this.reporter.add({ label: `Non e' stato possibile determinare il problema` });
        }
        break;
      case 'no-match':
        this.reporter.add({ label: `Esito: caso non riconosciuto` });
        if (t.errorMessage !== undefined && t.errorMessage !== '') {
          this.reporter.add({ label: `Errore più rappresentativo: ${t.errorMessage}` });
        } else {
          this.reporter.add({ label: `Nessun error message disponibile` });
        }
        break;
      case 'loop-detected':
        this.reporter.add({ label: `Esito: loop rilevato — analisi interrotta` });
        break;
      default: {
        const _exhaustive: never = t.reason;
        throw new Error(`Unknown TerminationReason: ${String(_exhaustive)}`);
      }
    }
  }
}
