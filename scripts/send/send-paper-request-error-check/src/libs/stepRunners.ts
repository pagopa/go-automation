/**
 * Send Paper Request Error Check - Step Runners
 */

import { Core } from '@go-automation/go-common';

import type {
  CheckFeedbackResult,
  RetrieveAttachmentsResult,
  SendPaperRequestErrorCheckConfig,
} from '../types/index.js';
import { checkFeedbackFromRequestIds } from './checkFeedback.js';
import { getNotificationAttachments } from './getNotificationAttachments.js';
import { retrieveAttachmentsFromIun } from './retrieveAttachmentsFromIun.js';
import { retrieveGlacierS3 } from './retrieveGlacierS3.js';
import { validateS3Pdfs } from './s3PdfValidator.js';
import { fetchTimelines } from './fetchTimelines.js';
import type { PaperRequestReporter } from './reporter.js';

async function runCheckFeedbackStep(
  script: Core.GOScript,
  inputLines: string[],
  reporter: PaperRequestReporter,
): Promise<CheckFeedbackResult> {
  script.logger.section('Step: Check Analog Feedback');
  if (inputLines.length === 0) {
    script.logger.warning(
      'Nessun file di input fornito (--inputFile / -f) o il file è vuoto. Fornire un file con i requestId da verificare.',
    );
    return {
      totalChecked: 0,
      foundCount: 0,
      notFoundCount: 0,
      foundRequestIds: [],
      notFoundRequestIds: [],
    };
  }
  const result = await checkFeedbackFromRequestIds(script, inputLines);
  reporter.recordCheckFeedback(result);
  script.logger.info(
    `Risultato Check Feedback: ${result.foundCount}/${result.totalChecked} trovati, ${result.notFoundCount} non trovati.`,
  );
  return result;
}

async function runGetAttachmentsStep(
  script: Core.GOScript,
  inputLines: string[],
  reporter: PaperRequestReporter,
): Promise<void> {
  script.logger.section('Step: Get Notification Attachments');
  if (inputLines.length === 0) {
    script.logger.warning(
      'Nessun file di input fornito (--inputFile / -f) o il file è vuoto. Fornire un file con gli IUN da verificare.',
    );
    return;
  }
  const result = await getNotificationAttachments(script, inputLines);
  reporter.recordGetNotificationAttachments(result);
  script.logger.info(
    `Risultato Get Attachments: ${result.attachmentsFound}/${result.totalProcessed} allegati trovati, ${result.deleteMarkersFound} con delete marker.`,
  );
}

async function runRetrieveAttachmentsStep(
  script: Core.GOScript,
  inputLines: string[],
  reporter: PaperRequestReporter,
): Promise<RetrieveAttachmentsResult> {
  script.logger.section('Step: Retrieve Attachments & AARs from IUN');
  if (inputLines.length === 0) {
    script.logger.warning(
      'Nessun file di input fornito (--inputFile / -f) o il file è vuoto. Fornire un file con gli IUN da elaborare.',
    );
    return {
      totalIuns: 0,
      attachmentsExtractedCount: 0,
      aarsExtractedCount: 0,
      errorsCount: 0,
      extractedKeys: [],
    };
  }
  const result = await retrieveAttachmentsFromIun(script, inputLines);
  reporter.recordRetrieveAttachments(result);
  script.logger.info(
    `Risultato Retrieve Attachments: ${result.attachmentsExtractedCount} allegati e ${result.aarsExtractedCount} AAR estratti da ${result.totalIuns} IUN.`,
  );
  return result;
}

async function runRetrieveGlacierStep(
  script: Core.GOScript,
  inputLines: string[],
  reporter: PaperRequestReporter,
): Promise<void> {
  script.logger.section('Step: Retrieve Glacier S3');
  const result = await retrieveGlacierS3(script, inputLines);
  reporter.recordGlacierRestore(result);
  if (result.skippedByUser) {
    script.logger.info("Restore da Glacier saltato su scelta dell'utente. Proseguimento al passaggio successivo.");
  } else {
    script.logger.info(
      `Risultato Restore Glacier: ${result.restoredCount} avviati, ${result.alreadyInProgressCount} in corso, ${result.alreadyAvailableCount} già disponibili, ${result.errorsCount} errori su ${result.totalItems} totali.`,
    );
  }
}

async function runValidatePdfStep(
  script: Core.GOScript,
  inputLines: string[],
  reporter: PaperRequestReporter,
): Promise<void> {
  script.logger.section('Step: Validate S3 PDFs (Magic Bytes)');
  const result = await validateS3Pdfs(script, inputLines);
  reporter.recordPdfValidation(result);
  script.logger.info(
    `Risultato Validazione PDF: ${result.validPdfCount}/${result.totalChecked} validi, ${result.invalidPdfCount} non validi, ${result.errorCount} errori.`,
  );
}

async function runFetchTimelinesStep(
  script: Core.GOScript,
  inputLines: string[],
  reporter: PaperRequestReporter,
): Promise<void> {
  script.logger.section('Step: Fetch Timelines from DynamoDB');
  if (inputLines.length === 0) {
    script.logger.warning(
      'Nessun file di input fornito (--inputFile / -f) o il file è vuoto. Fornire un file con gli IUN per scaricare le timeline.',
    );
    return;
  }
  const result = await fetchTimelines(script, inputLines);
  reporter.recordFetchTimelines(result);
  script.logger.info(
    `Risultato Fetch Timelines: ${result.timelinesFetchedCount}/${result.totalIuns} timeline scaricate, ${result.emptyTimelinesCount} vuote, ${result.errorsCount} errori.`,
  );
}

export async function executeStepByMode(
  script: Core.GOScript,
  config: SendPaperRequestErrorCheckConfig,
  inputLines: string[],
  reporter: PaperRequestReporter,
): Promise<void> {
  const isAll = config.mode === 'all';
  let currentLines = inputLines;

  if (config.mode === 'check-feedback' || isAll) {
    const feedbackResult = await runCheckFeedbackStep(script, currentLines, reporter);
    if (isAll) {
      currentLines = [...feedbackResult.notFoundRequestIds];
      if (currentLines.length === 0) {
        script.logger.info(
          'Tutti i requestId presentano un feedback in pn-Timelines (salvati in found.json). Nessun requestId non trovato da verificare per i passaggi successivi.',
        );
        return;
      }
      script.logger.info(
        `I passaggi successivi procedono con i soli ${currentLines.length} requestId non trovati (salvati in not_found.txt).`,
      );
    }
  }

  if (config.mode === 'fetch-timelines' || isAll) {
    await runFetchTimelinesStep(script, currentLines, reporter);
  }

  let extractedKeys: string[] = [];
  if (config.mode === 'retrieve-attachments' || isAll) {
    const retrieveResult = await runRetrieveAttachmentsStep(script, currentLines, reporter);
    if (retrieveResult.extractedKeys && retrieveResult.extractedKeys.length > 0) {
      extractedKeys = [...retrieveResult.extractedKeys];
    }
  }

  if (config.mode === 'get-attachments' || isAll) {
    await runGetAttachmentsStep(script, currentLines, reporter);
  }

  const s3TargetLines = isAll && extractedKeys.length > 0 ? extractedKeys : currentLines;

  if (config.mode === 'retrieve-glacier' || isAll) {
    if (isAll && extractedKeys.length === 0) {
      script.logger.info('Nessuna chiave allegato S3 estratta per il ripristino da Glacier. Step saltato.');
    } else {
      await runRetrieveGlacierStep(script, s3TargetLines, reporter);
    }
  }

  if (config.mode === 'validate-pdf' || isAll) {
    if (isAll && extractedKeys.length === 0) {
      script.logger.info('Nessuna chiave allegato S3 estratta per la validazione PDF. Step saltato.');
    } else {
      await runValidatePdfStep(script, s3TargetLines, reporter);
    }
  }
}
