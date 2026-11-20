import { ApiGwReporter } from '../../../../common/families/apigw/reporting/ApiGwReporter.js';

/**
 * Narrative of a service read of the SEND API Gateway pipeline: the generic API Gateway events, plus the section,
 * the query and the rows of a service.
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
}
