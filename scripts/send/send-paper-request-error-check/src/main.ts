/**
 * Send Paper Request Error Check - Main Logic Module
 *
 * Logica principale di orchestrazione dello script.
 */

import fs from 'fs';
import { Core } from '@go-automation/go-common';

import type { SendPaperRequestErrorCheckConfig } from './types/index.js';
import { checkFeedbackFromRequestIds } from './libs/checkFeedback.js';
import { getNotificationAttachments } from './libs/getNotificationAttachments.js';
import { retrieveAttachmentsFromIun } from './libs/retrieveAttachmentsFromIun.js';

/**
 * Legge i requestId o IUN da un file di input specificato.
 */
function readInputLines(filePath?: string): string[] {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/**
 * Main script execution function
 *
 * @param script - Istanza GOScript per il logging ed il ciclo di vita
 */
export async function main(script: Core.GOScript): Promise<void> {
  script.logger.section('Starting Send Paper Request Error Check');
  const config = await script.getConfiguration<SendPaperRequestErrorCheckConfig>();

  script.logger.info(`Execution mode: ${config.mode}`);
  script.logger.info(`Output directory: ${config.outputDir}`);

  const inputLines = readInputLines(config.inputFile);

  // Step 1: Check Analog Feedback
  if (config.mode === 'check-feedback' || config.mode === 'all') {
    script.logger.section('Step: Check Analog Feedback');
    if (inputLines.length === 0) {
      script.logger.warning(
        'Nessun file di input fornito (--inputFile / -f) o il file è vuoto. Fornire un file con i requestId da verificare.',
      );
    } else {
      const result = await checkFeedbackFromRequestIds(script, inputLines);
      script.logger.info(
        `Risultato Check Feedback: ${result.foundCount}/${result.totalChecked} trovati, ${result.notFoundCount} non trovati.`,
      );
    }
  }

  // Step 2: Get Notification Attachments
  if (config.mode === 'get-attachments' || config.mode === 'all') {
    script.logger.section('Step: Get Notification Attachments');
    if (inputLines.length === 0) {
      script.logger.warning(
        'Nessun file di input fornito (--inputFile / -f) o il file è vuoto. Fornire un file con gli IUN da verificare.',
      );
    } else {
      const result = await getNotificationAttachments(script, inputLines);
      script.logger.info(
        `Risultato Get Attachments: ${result.attachmentsFound}/${result.totalProcessed} allegati trovati, ${result.deleteMarkersFound} con delete marker.`,
      );
    }
  }

  // Step 3: Retrieve Attachments & AARs from IUN
  if (config.mode === 'retrieve-attachments' || config.mode === 'all') {
    script.logger.section('Step: Retrieve Attachments & AARs from IUN');
    if (inputLines.length === 0) {
      script.logger.warning(
        'Nessun file di input fornito (--inputFile / -f) o il file è vuoto. Fornire un file con gli IUN da elaborare.',
      );
    } else {
      const result = await retrieveAttachmentsFromIun(script, inputLines);
      script.logger.info(
        `Risultato Retrieve Attachments: ${result.attachmentsExtractedCount} allegati e ${result.aarsExtractedCount} AAR estratti da ${result.totalIuns} IUN.`,
      );
    }
  }

  script.logger.success('Paper Request Error Check run completed successfully');
}
