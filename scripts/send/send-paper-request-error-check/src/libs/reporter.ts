import fs from 'fs';
import path from 'path';
import type { Core } from '@go-automation/go-common';
import { get } from '../utils/get.js';
import type {
  CheckFeedbackResult,
  FetchTimelinesResult,
  GetNotificationAttachmentsResult,
  PaperRequestMetrics,
  PdfValidationResult,
  RetrieveAttachmentsResult,
  RetrieveGlacierResult,
} from '../types/index.js';

/**
 * Gestore delle metriche e della generazione del report finale di elaborazione.
 */
export class PaperRequestReporter {
  private metrics: PaperRequestMetrics = {
    totalInitialRequestIds: 0,
    canceledCount: 0,
    perfectedCount: 0,
    invalidAttachmentsCount: 0,
    toResubmitCount: 0,
    toVerifyManuallyCount: 0,
    glacierRestoredCount: 0,
    attachmentsFoundCount: 0,
    validPdfCount: 0,
    invalidPdfCount: 0,
    timelinesFetchedCount: 0,
    errorsCount: 0,
  };

  /**
   * Imposta il conteggio iniziale totale dei requestId / IUN.
   */
  public setInitialTotal(total: number): void {
    this.metrics.totalInitialRequestIds = total;
  }

  /**
   * Registra i risultati dello step Check Analog Feedback.
   */
  public recordCheckFeedback(result: CheckFeedbackResult): void {
    if (this.metrics.totalInitialRequestIds === 0) {
      this.metrics.totalInitialRequestIds = result.totalChecked;
    }
    // Esempio classificazione logica feedback
    for (const found of result.foundRequestIds) {
      const category = get<string>(found.event, 'category', '');
      if (category === 'REFINEMENT' || category === 'PERFECTED') {
        this.metrics.perfectedCount++;
      } else if (category === 'CANCELED' || category === 'CANCELLED') {
        this.metrics.canceledCount++;
      }
    }
    this.metrics.toVerifyManuallyCount += result.notFoundCount;
  }

  /**
   * Registra i risultati dello step Get Notification Attachments.
   */
  public recordGetNotificationAttachments(result: GetNotificationAttachmentsResult): void {
    this.metrics.attachmentsFoundCount = (this.metrics.attachmentsFoundCount ?? 0) + result.attachmentsFound;
    this.metrics.errorsCount = (this.metrics.errorsCount ?? 0) + result.dynamoUpdateErrors;
  }

  /**
   * Registra i risultati dello step Retrieve Attachments & AARs.
   */
  public recordRetrieveAttachments(result: RetrieveAttachmentsResult): void {
    this.metrics.attachmentsFoundCount =
      (this.metrics.attachmentsFoundCount ?? 0) + result.attachmentsExtractedCount + result.aarsExtractedCount;
    this.metrics.errorsCount = (this.metrics.errorsCount ?? 0) + result.errorsCount;
  }

  /**
   * Registra i risultati dello step Restore S3 Glacier.
   */
  public recordGlacierRestore(result: RetrieveGlacierResult): void {
    this.metrics.glacierRestoredCount += result.restoredCount;
    this.metrics.errorsCount = (this.metrics.errorsCount ?? 0) + result.errorsCount;
  }

  /**
   * Registra i risultati dello step Validate S3 PDFs.
   */
  public recordPdfValidation(result: PdfValidationResult): void {
    this.metrics.validPdfCount = (this.metrics.validPdfCount ?? 0) + result.validPdfCount;
    this.metrics.invalidPdfCount = (this.metrics.invalidPdfCount ?? 0) + result.invalidPdfCount;
    this.metrics.invalidAttachmentsCount += result.invalidPdfCount;
    this.metrics.errorsCount = (this.metrics.errorsCount ?? 0) + result.errorCount;
  }

  /**
   * Registra i risultati dello step Fetch Timelines.
   */
  public recordFetchTimelines(result: FetchTimelinesResult): void {
    this.metrics.timelinesFetchedCount = (this.metrics.timelinesFetchedCount ?? 0) + result.timelinesFetchedCount;
    this.metrics.errorsCount = (this.metrics.errorsCount ?? 0) + result.errorsCount;
  }

  /**
   * Genera i report finali (`summary_report.json` e `summary_report.csv`) e stampa la tabella riepilogativa su console.
   *
   * @param outputDir - Cartella di destinazione dei file di report
   * @param logger - Istanza del logger di GOScript
   */
  public generateReport(outputDir: string, logger: Core.GOLogger): PaperRequestMetrics {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString();
    const reportData = {
      timestamp,
      metrics: this.metrics,
    };

    // 1. Salvataggio JSON
    const jsonPath = path.join(outputDir, 'summary_report.json');
    fs.writeFileSync(jsonPath, JSON.stringify(reportData, null, 2), 'utf8');

    // 2. Salvataggio CSV
    const csvPath = path.join(outputDir, 'summary_report.csv');
    const csvLines = [
      'Metric,Value',
      `totalInitialRequestIds,${this.metrics.totalInitialRequestIds}`,
      `canceledCount,${this.metrics.canceledCount}`,
      `perfectedCount,${this.metrics.perfectedCount}`,
      `invalidAttachmentsCount,${this.metrics.invalidAttachmentsCount}`,
      `toResubmitCount,${this.metrics.toResubmitCount}`,
      `toVerifyManuallyCount,${this.metrics.toVerifyManuallyCount}`,
      `glacierRestoredCount,${this.metrics.glacierRestoredCount}`,
      `attachmentsFoundCount,${this.metrics.attachmentsFoundCount ?? 0}`,
      `validPdfCount,${this.metrics.validPdfCount ?? 0}`,
      `invalidPdfCount,${this.metrics.invalidPdfCount ?? 0}`,
      `timelinesFetchedCount,${this.metrics.timelinesFetchedCount ?? 0}`,
      `errorsCount,${this.metrics.errorsCount ?? 0}`,
    ];
    fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');

    // 3. Stampa tabella di riepilogo a console
    logger.section('SUMMARY REPORT METRICS');
    logger.info(`📄 Report salvato in:`);
    logger.info(`   - JSON: ${jsonPath}`);
    logger.info(`   - CSV:  ${csvPath}`);
    logger.info('----------------------------------------------------');
    logger.info(`Total Initial RequestIDs / IUNs : ${this.metrics.totalInitialRequestIds}`);
    logger.info(`Perfected Requests             : ${this.metrics.perfectedCount}`);
    logger.info(`Canceled Requests              : ${this.metrics.canceledCount}`);
    logger.info(`Invalid Attachments            : ${this.metrics.invalidAttachmentsCount}`);
    logger.info(`Glacier Restored Objects       : ${this.metrics.glacierRestoredCount}`);
    logger.info(`Valid PDFs Checked             : ${this.metrics.validPdfCount ?? 0}`);
    logger.info(`Invalid PDFs Checked           : ${this.metrics.invalidPdfCount ?? 0}`);
    logger.info(`Timelines Fetched              : ${this.metrics.timelinesFetchedCount ?? 0}`);
    logger.info(`Requests to Verify Manually    : ${this.metrics.toVerifyManuallyCount}`);
    logger.info(`Total Errors                   : ${this.metrics.errorsCount ?? 0}`);
    logger.info('----------------------------------------------------');

    return { ...this.metrics };
  }
}
