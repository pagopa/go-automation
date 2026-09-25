/**
 * Send Paper Request Error Check - Step Runners
 */

import { Core } from '@go-automation/go-common';

import type { SendPaperRequestErrorCheckConfig } from '../types/index.js';
import { checkFeedbackFromRequestIds } from './checkFeedback.js';
import { getNotificationAttachments } from './getNotificationAttachments.js';
import { retrieveAttachmentsFromIun } from './retrieveAttachmentsFromIun.js';
import { retrieveGlacierS3 } from './retrieveGlacierS3.js';
import { validateS3Pdfs } from './s3PdfValidator.js';
import { fetchTimelines } from './fetchTimelines.js';
import type { PaperRequestReporter } from './reporter.js';

export async function runCheckFeedbackStep(
  script: Core.GOScript,
  inputLines: string[],
  reporter: PaperRequestReporter,
): Promise<void> {
  script.logger.section('Step: Check Analog Feedback');
  if (inputLines.length === 0) {
    script.logger.warning(
      'Nessun file di input fornito (--inputFile / -f) o il file è vuoto. Fornire un file con i requestId da verificare.',
    );
    return;
  }
  const result = await checkFeedbackFromRequestIds(script, inputLines);
  reporter.recordCheckFeedback(result);
  script.logger.info(
    `Risultato Check Feedback: ${result.foundCount}/${result.totalChecked} trovati, ${result.notFoundCount} non trovati.`,
  );
}

export async function runGetAttachmentsStep(
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

export async function runRetrieveAttachmentsStep(
  script: Core.GOScript,
  inputLines: string[],
  reporter: PaperRequestReporter,
): Promise<void> {
  script.logger.section('Step: Retrieve Attachments & AARs from IUN');
  if (inputLines.length === 0) {
    script.logger.warning(
      'Nessun file di input fornito (--inputFile / -f) o il file è vuoto. Fornire un file con gli IUN da elaborare.',
    );
    return;
  }
  const result = await retrieveAttachmentsFromIun(script, inputLines);
  reporter.recordRetrieveAttachments(result);
  script.logger.info(
    `Risultato Retrieve Attachments: ${result.attachmentsExtractedCount} allegati e ${result.aarsExtractedCount} AAR estratti da ${result.totalIuns} IUN.`,
  );
}

export async function runRetrieveGlacierStep(
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

export async function runValidatePdfStep(
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

export async function runFetchTimelinesStep(
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

  if (config.mode === 'check-feedback' || isAll) {
    await runCheckFeedbackStep(script, inputLines, reporter);
  }
  if (config.mode === 'get-attachments' || isAll) {
    await runGetAttachmentsStep(script, inputLines, reporter);
  }
  if (config.mode === 'retrieve-attachments' || isAll) {
    await runRetrieveAttachmentsStep(script, inputLines, reporter);
  }
  if (config.mode === 'retrieve-glacier' || isAll) {
    await runRetrieveGlacierStep(script, inputLines, reporter);
  }
  if (config.mode === 'validate-pdf' || isAll) {
    await runValidatePdfStep(script, inputLines, reporter);
  }
  if (config.mode === 'fetch-timelines' || isAll) {
    await runFetchTimelinesStep(script, inputLines, reporter);
  }
}
