import { mkdir } from 'node:fs/promises';
import path from 'path';
import type { GOScript } from '@go-automation/go-script';
import { GOFileListExporter, GOJSONListExporter } from '@pagopa/go-common/exporters';
import { extractIun, get } from '../utils/get.js';
import type {
  CheckFeedbackResult,
  GetNotificationAttachmentsResult,
  PaperRequestMetrics,
  PdfValidationResult,
  RetrieveAttachmentsResult,
  RetrieveGlacierResult,
  VerifyPcRetryResult,
} from '../types/index.js';
import { resolveOutputPath } from '../utils/resolveOutputPath.js';

/**
 * Gestore delle metriche e della generazione del report finale di elaborazione.
 */
export class PaperRequestReporter {
  private readonly metrics: PaperRequestMetrics = {
    totalInitialRequestIds: 0,
    withFeedback: 0,
    withoutFeedback: 0,
    failedFeedbackCount: 0,
    timelinesFetchedCount: 0,
    canceledCount: 0,
    perfectedCount: 0,
    viewedCount: 0,
    refinedCount: 0,
    invalidAttachmentsCount: 0,
    toResubmitCount: 0,
    glacierRestoredCount: 0,
    attachmentsFoundCount: 0,
    validPdfCount: 0,
    invalidPdfCount: 0,
    errorsCount: 0,
  };

  // Snapshot dei risultati grezzi per ogni step (per il dettaglio nel summary)
  private checkFeedbackResult: CheckFeedbackResult | undefined;
  private getAttachmentsResult: GetNotificationAttachmentsResult | undefined;
  private retrieveAttachmentsResult: RetrieveAttachmentsResult | undefined;
  private glacierResult: RetrieveGlacierResult | undefined;
  private pdfValidationResult: PdfValidationResult | undefined;
  private verifyPcRetryResult: VerifyPcRetryResult | undefined;
  private fetchTimelinesResult:
    | {
        totalIuns: number;
        timelinesFetchedCount: number;
        emptyTimelinesCount: number;
        errorsCount: number;
        filteredIuns: string[];
      }
    | undefined;

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
    this.checkFeedbackResult = result;
    if (this.metrics.totalInitialRequestIds === 0) {
      this.metrics.totalInitialRequestIds = result.totalChecked;
    }
    this.metrics.withFeedback += result.foundRequestIds.length;
    this.metrics.withoutFeedback += result.notFoundCount;
    const failedCount = result.failedCount ?? result.failedRequestIds?.length ?? 0;
    this.metrics.failedFeedbackCount = (this.metrics.failedFeedbackCount ?? 0) + failedCount;
    this.metrics.errorsCount = (this.metrics.errorsCount ?? 0) + failedCount;
  }

  /**
   * Registra i risultati dello step Get Notification Attachments.
   */
  public recordGetNotificationAttachments(result: GetNotificationAttachmentsResult): void {
    this.getAttachmentsResult = result;
    this.metrics.attachmentsFoundCount = (this.metrics.attachmentsFoundCount ?? 0) + result.attachmentsFound;
    this.metrics.errorsCount = (this.metrics.errorsCount ?? 0) + (result.errorsCount ?? result.dynamoUpdateErrors ?? 0);
  }

  /**
   * Registra i risultati dello step Retrieve Attachments & AARs.
   */
  public recordRetrieveAttachments(result: RetrieveAttachmentsResult): void {
    this.retrieveAttachmentsResult = result;
    this.metrics.glacierEligibleAarCount =
      (this.metrics.glacierEligibleAarCount ?? 0) + (result.glacierEligibleAarKeys?.length ?? 0);
    this.metrics.pdfEligibleAttachmentsCount =
      (this.metrics.pdfEligibleAttachmentsCount ?? 0) + (result.validPdfAttachmentKeys?.length ?? 0);
    this.metrics.skippedAttachmentsDeleteMarkerCount =
      (this.metrics.skippedAttachmentsDeleteMarkerCount ?? 0) + (result.skippedAttachmentsDeleteMarkerCount ?? 0);
    this.metrics.skippedAarActiveTierCount =
      (this.metrics.skippedAarActiveTierCount ?? 0) + (result.skippedAarActiveTierCount ?? 0);
    this.metrics.errorsCount = (this.metrics.errorsCount ?? 0) + result.errorsCount;
  }

  /**
   * Registra i risultati dello step Restore S3 Glacier.
   */
  public recordGlacierRestore(result: RetrieveGlacierResult): void {
    this.glacierResult = result;
    this.metrics.glacierRestoredCount += result.restoredCount;
    this.metrics.errorsCount = (this.metrics.errorsCount ?? 0) + result.errorsCount;
  }

  /**
   * Registra i risultati dello step Validate S3 PDFs.
   */
  public recordPdfValidation(result: PdfValidationResult): void {
    this.pdfValidationResult = result;
    this.metrics.validPdfCount = (this.metrics.validPdfCount ?? 0) + result.validPdfCount;
    this.metrics.invalidPdfCount = (this.metrics.invalidPdfCount ?? 0) + result.invalidPdfCount;
    this.metrics.invalidAttachmentsCount += result.invalidPdfCount;
    this.metrics.errorsCount = (this.metrics.errorsCount ?? 0) + result.errorCount;
  }

  /**
   * Registra i risultati dello step Fetch Timelines.
   */
  public recordFetchTimelines(result: {
    totalIuns: number;
    timelinesFetchedCount: number;
    emptyTimelinesCount: number;
    errorsCount: number;
    filteredIuns: string[];
  }): void {
    this.fetchTimelinesResult = result;
    this.metrics.timelinesFetchedCount = (this.metrics.timelinesFetchedCount ?? 0) + result.timelinesFetchedCount;
    this.metrics.errorsCount = (this.metrics.errorsCount ?? 0) + result.errorsCount;
  }

  /**
   * Registra i risultati dello step di verifica della notifica
   */
  public recordVerifyNotificationTimeline(result: {
    notificationCanceled: number;
    notificationViewed: number;
    notificationRefined: number;
  }): void {
    this.metrics.canceledCount = this.metrics.canceledCount + result.notificationCanceled;
    this.metrics.viewedCount = this.metrics.viewedCount + result.notificationViewed;
    this.metrics.refinedCount = this.metrics.refinedCount + result.notificationRefined;
  }

  /**
   * Registra i risultati dello step finale di verifica PCRETRY su pn-EcRichiesteMetadati.
   */
  public recordVerifyPcRetry(result: VerifyPcRetryResult): void {
    this.verifyPcRetryResult = result;
    this.metrics.toResubmitCount += result.toResubmitCount;
    this.metrics.errorsCount = (this.metrics.errorsCount ?? 0) + result.errorsCount;
  }

  /**
   * Genera i report finali (`summary_report.json` e `summary_report.csv`) e stampa la tabella riepilogativa su console.
   *
   * @param outputDir - Cartella di destinazione dei file di report
   * @param script
   */
  public async generateReport(outputDir: string, script: GOScript): Promise<PaperRequestMetrics> {
    const timestamp = new Date().toISOString();
    const stepDetails: Record<string, unknown> = {};

    let withFeedbackPath: string | undefined;
    let withoutFeedbackPath: string | undefined;

    if (this.checkFeedbackResult) {
      const cf = this.checkFeedbackResult;

      // 1. with_feedback.csv
      withFeedbackPath = resolveOutputPath(script.paths, 'with_feedback.csv', outputDir);
      const withFeedbackLines = [
        'requestId,iun,feedbackType,timelineElementId,timestamp,details',
        ...cf.foundRequestIds.map((item) => {
          const iun = extractIun(item.requestId);
          const category = get<string>(item.event, 'category', 'UNKNOWN');
          const elementId = get<string>(item.event, 'timelineElementId', '');
          const eventTimestamp = get<string>(item.event, 'timestamp', '');
          const detailsObj = get<Record<string, unknown> | undefined>(item.event, 'details');
          const detailsStr = detailsObj ? `"${JSON.stringify(detailsObj).replace(/"/g, '""')}"` : '';
          return `"${item.requestId}","${iun}","${category}","${elementId}","${eventTimestamp}",${detailsStr}`;
        }),
      ];
      const withFeedbackExporter = new GOFileListExporter({ outputPath: withFeedbackPath });
      await withFeedbackExporter.export(withFeedbackLines);

      // 2. without_feedback.csv
      withoutFeedbackPath = resolveOutputPath(script.paths, 'without_feedback.csv', outputDir);
      const withoutFeedbackLines = [
        'requestId,iun',
        ...cf.notFoundRequestIds.map((rid) => `"${rid}","${extractIun(rid)}"`),
      ];
      const withoutFeedbackExporter = new GOFileListExporter({ outputPath: withoutFeedbackPath });
      await withoutFeedbackExporter.export(withoutFeedbackLines);

      stepDetails['checkFeedback'] = {
        totalChecked: cf.totalChecked,
        withFeedback: cf.foundCount,
        withoutFeedback: cf.notFoundCount,
        failed: cf.failedCount ?? cf.failedRequestIds?.length ?? 0,
        files: {
          withFeedback: withFeedbackPath,
          withoutFeedback: withoutFeedbackPath,
        },
      };
    }

    if (this.getAttachmentsResult) {
      const ga = this.getAttachmentsResult;
      stepDetails['getAttachments'] = {
        totalProcessed: ga.totalProcessed,
        notificationsFound: ga.notificationsFound,
        notificationsNotFound: ga.notificationsNotFound,
        attachmentsFound: ga.attachmentsFound,
        attachmentsNotFound: ga.attachmentsNotFound,
        deleteMarkersFound: ga.deleteMarkersFound,
        errors: ga.errorsCount ?? ga.dynamoUpdateErrors ?? 0,
      };
    }

    if (this.retrieveAttachmentsResult) {
      const ra = this.retrieveAttachmentsResult;
      stepDetails['retrieveAttachments'] = {
        totalIuns: ra.totalIuns,
        attachmentsExtracted: ra.attachmentsExtractedCount,
        aarsExtracted: ra.aarsExtractedCount,
        errors: ra.errorsCount,
      };
    }

    if (this.glacierResult) {
      const gr = this.glacierResult;
      stepDetails['glacierRestore'] = gr.skippedByUser
        ? { skippedByUser: true, totalItems: gr.totalItems }
        : {
            skippedByUser: false,
            totalItems: gr.totalItems,
            restored: gr.restoredCount,
            alreadyInProgress: gr.alreadyInProgressCount,
            alreadyAvailable: gr.alreadyAvailableCount,
            errors: gr.errorsCount,
          };
    }

    if (this.pdfValidationResult) {
      const pv = this.pdfValidationResult;
      stepDetails['validatePdf'] = {
        totalChecked: pv.totalChecked,
        valid: pv.validPdfCount,
        invalid: pv.invalidPdfCount,
        errors: pv.errorCount,
      };
    }

    if (this.fetchTimelinesResult) {
      const ft = this.fetchTimelinesResult;
      stepDetails['fetchTimelines'] = {
        totalIuns: ft.totalIuns,
        timelinesFetched: ft.timelinesFetchedCount,
        emptyTimelines: ft.emptyTimelinesCount,
        errors: ft.errorsCount,
      };
    }

    if (this.verifyPcRetryResult) {
      const pr = this.verifyPcRetryResult;
      stepDetails['verifyPcRetry'] = {
        totalChecked: pr.totalChecked,
        toResubmitCount: pr.toResubmitCount,
        discardedCount: pr.discardedCount,
        errorsCount: pr.errorsCount,
        statusCounters: pr.statusCounters,
      };
    }

    const reportData = {
      timestamp,
      metrics: this.metrics,
      stepDetails,
    };

    // 1. Salvataggio JSON via GOJSONListExporter
    const jsonPath = path.join(outputDir, 'summary_report.json');

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- output path is generated through GOPaths or explicit operator-provided path.
    await mkdir(path.dirname(jsonPath), { recursive: true });

    const jsonExporter = new GOJSONListExporter({ outputPath: jsonPath, jsonl: false });
    await jsonExporter.export([reportData]);

    await jsonExporter.export([reportData]);

    // 2. Salvataggio CSV via GOFileListExporter
    const csvPath = resolveOutputPath(script.paths, 'summary_report.csv', outputDir);
    const csvLines = [
      'Metric,Value',
      `totalInitialRequestIds,${this.metrics.totalInitialRequestIds}`,
      `canceledCount,${this.metrics.canceledCount}`,
      `perfectedCount,${this.metrics.perfectedCount}`,
      `viewedCount,${this.metrics.viewedCount}`,
      `refinedCount,${this.metrics.refinedCount}`,
      `invalidAttachmentsCount,${this.metrics.invalidAttachmentsCount}`,
      `toResubmitCount,${this.metrics.toResubmitCount}`,
      `withFeedback,${this.metrics.withFeedback}`,
      `withoutFeedback,${this.metrics.withoutFeedback}`,
      `failedFeedbackCount,${this.metrics.failedFeedbackCount ?? 0}`,
      `glacierRestoredCount,${this.metrics.glacierRestoredCount}`,
      `glacierEligibleAarCount,${this.metrics.glacierEligibleAarCount ?? 0}`,
      `pdfEligibleAttachmentsCount,${this.metrics.pdfEligibleAttachmentsCount ?? 0}`,
      `skippedAttachmentsDeleteMarkerCount,${this.metrics.skippedAttachmentsDeleteMarkerCount ?? 0}`,
      `skippedAarActiveTierCount,${this.metrics.skippedAarActiveTierCount ?? 0}`,
      `attachmentsFoundCount,${this.metrics.attachmentsFoundCount ?? 0}`,
      `validPdfCount,${this.metrics.validPdfCount ?? 0}`,
      `invalidPdfCount,${this.metrics.invalidPdfCount ?? 0}`,
      `timelinesFetchedCount,${this.metrics.timelinesFetchedCount ?? 0}`,
      `errorsCount,${this.metrics.errorsCount ?? 0}`,
    ];
    const fileExporter = new GOFileListExporter({ outputPath: csvPath });
    await fileExporter.export(csvLines);

    // 3. Stampa tabella di riepilogo a console
    script.logger.section('SUMMARY REPORT METRICS');
    script.logger.info(`📄 Report salvato in:`);
    script.logger.info(`   - JSON: ${jsonPath}`);
    script.logger.info(`   - CSV:  ${csvPath}`);
    if (withFeedbackPath) {
      script.logger.info(`   - With Feedback:    ${withFeedbackPath}`);
    }
    if (withoutFeedbackPath) {
      script.logger.info(`   - Without Feedback: ${withoutFeedbackPath}`);
    }
    script.logger.info('----------------------------------------------------');
    script.logger.info(`Total Initial RequestIDs / IUNs : ${this.metrics.totalInitialRequestIds}`);
    script.logger.info('----------------------------------------------------');

    // Dettaglio per step: Check Analog Feedback
    if (this.checkFeedbackResult) {
      const cf = this.checkFeedbackResult;
      const failedCount = cf.failedCount ?? cf.failedRequestIds?.length ?? 0;
      const failedMsg = failedCount > 0 ? `, errori/falliti: ${failedCount}` : '';
      script.logger.info(
        `[Check Feedback]     Request IDs iniziali: ${cf.totalChecked}` +
          ` → con feedback: ${cf.foundCount}, senza feedback: ${cf.notFoundCount}${failedMsg}`,
      );
    }

    // Dettaglio per step: Get Notification Attachments
    if (this.getAttachmentsResult) {
      const ga = this.getAttachmentsResult;
      script.logger.info(
        `[Get Attachments]    Notifiche processate: ${ga.totalProcessed}` +
          ` → trovate: ${ga.notificationsFound}, non trovate: ${ga.notificationsNotFound}` +
          ` | Allegati: trovati: ${ga.attachmentsFound}, non trovati: ${ga.attachmentsNotFound}` +
          `, delete marker: ${ga.deleteMarkersFound}`,
      );
    }

    // Dettaglio per step: Retrieve Attachments & AARs
    if (this.retrieveAttachmentsResult) {
      const ra = this.retrieveAttachmentsResult;
      script.logger.info(
        `[Retrieve Attachments] IUN processati: ${ra.totalIuns}` +
          ` → allegati estratti: ${ra.attachmentsExtractedCount} (${ra.validPdfAttachmentKeys?.length ?? 0} per validazione PDF, ${ra.skippedAttachmentsDeleteMarkerCount ?? 0} scartati delete marker)` +
          `, AAR estratti: ${ra.aarsExtractedCount} (${ra.glacierEligibleAarKeys?.length ?? 0} eleggibili Glacier >1 anno, ${ra.skippedAarActiveTierCount ?? 0} active tier)` +
          `, errori: ${ra.errorsCount}`,
      );
    }

    // Dettaglio per step: Glacier Restore
    if (this.glacierResult) {
      const gr = this.glacierResult;
      if (gr.skippedByUser) {
        script.logger.info(`[Glacier Restore]    Saltato dall'utente (${gr.totalItems} elementi).`);
      } else {
        script.logger.info(
          `[Glacier Restore]    Elementi totali: ${gr.totalItems}` +
            ` → restore avviati: ${gr.restoredCount}, già in corso: ${gr.alreadyInProgressCount}` +
            `, già disponibili: ${gr.alreadyAvailableCount}, errori: ${gr.errorsCount}`,
        );
      }
    }

    // Dettaglio per step: Validate S3 PDFs
    if (this.pdfValidationResult) {
      const pv = this.pdfValidationResult;
      script.logger.info(
        `[Validate PDF]       PDF controllati: ${pv.totalChecked}` +
          ` → validi: ${pv.validPdfCount}, non validi: ${pv.invalidPdfCount}, errori: ${pv.errorCount}`,
      );
    }

    // Dettaglio per step: Fetch Timelines
    if (this.fetchTimelinesResult) {
      const ft = this.fetchTimelinesResult;
      script.logger.info(
        `[Fetch Timelines]    IUN processati: ${ft.totalIuns}` +
          ` → timeline scaricate: ${ft.timelinesFetchedCount}, vuote: ${ft.emptyTimelinesCount}` +
          `, errori: ${ft.errorsCount}`,
      );
    }

    // Dettaglio per step: Verify PCRETRY
    if (this.verifyPcRetryResult) {
      const pr = this.verifyPcRetryResult;
      script.logger.info(
        `[Verify PCRETRY]     Request IDs verificati: ${pr.totalChecked}` +
          ` → da risottomettere: ${pr.toResubmitCount}, scartati (senza errori): ${pr.discardedCount}` +
          `, errori: ${pr.errorsCount}`,
      );
    }

    script.logger.info('----------------------------------------------------');
    script.logger.info(`Total initial Requests         : ${this.metrics.totalInitialRequestIds}`);
    script.logger.info(`Requests with Feedback         : ${this.metrics.withFeedback}`);
    script.logger.info(`Requests without Feedback      : ${this.metrics.withoutFeedback}`);
    script.logger.info(`Timelines Fetched              : ${this.metrics.timelinesFetchedCount ?? 0}`);
    script.logger.info(`Perfected Requests             : ${this.metrics.perfectedCount}`);
    script.logger.info(`Viewed Requests                : ${this.metrics.viewedCount}`);
    script.logger.info(`Canceled Requests              : ${this.metrics.canceledCount}`);
    script.logger.info(`Refined Requests               : ${this.metrics.refinedCount}`);
    script.logger.info(`To Resubmit (PCRETRY)          : ${this.metrics.toResubmitCount}`);
    script.logger.info(`Invalid Attachments            : ${this.metrics.invalidAttachmentsCount}`);
    script.logger.info(`Glacier Restored Objects       : ${this.metrics.glacierRestoredCount}`);
    script.logger.info(`Valid PDFs Checked             : ${this.metrics.validPdfCount ?? 0}`);
    script.logger.info(`Invalid PDFs Checked           : ${this.metrics.invalidPdfCount ?? 0}`);
    script.logger.info(`Total Errors                   : ${this.metrics.errorsCount ?? 0}`);
    script.logger.info('----------------------------------------------------');

    return { ...this.metrics };
  }
}
