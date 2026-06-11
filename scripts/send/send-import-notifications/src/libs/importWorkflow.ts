import { Core } from '@go-automation/go-common';
import {
  QATestFormatAdapter,
  SENDNotificationImportWorker,
  SENDNotifications,
  loadUploadedAttachments,
} from '@go-automation/go-send';
import type { SENDNotificationRow, SENDUploadedAttachment } from '@go-automation/go-send';

import { displayResults } from './displayResults.js';
import type { ImportNotificationsConfig } from '../types/ImportNotificationsConfig.js';

type ExportPathInfo = Core.GOPathResolutionResult | undefined;
type AttachmentsByPratica = ReadonlyMap<string, ReadonlyArray<SENDUploadedAttachment>>;

export interface ImportWorkflowComponents {
  readonly attachmentsByPratica: AttachmentsByPratica | undefined;
  readonly exporter: Core.GOCSVListExporter<Record<string, unknown>> | undefined;
  readonly exportPathInfo: ExportPathInfo;
  readonly importer: Core.GOCSVListImporter<SENDNotificationRow>;
  readonly worker: SENDNotificationImportWorker;
}

/** Base export columns for the CSV output */
const BASE_EXPORT_COLUMNS = [
  'ID_Scenario',
  'Scenario',
  'Prodotto',
  'Destinatario',
  'Denomination',
  'Indirizzo PEC',
  'physicalCommunicationType',
  'CAP',
  'Provincia',
  'Citta',
  'Stato',
  'Range',
  'Indirizzo',
  'Sender',
  'Tax ID',
  'RequestID',
  'Data invio Test',
  'Stato',
  'Esito',
  'Note',
  'iun',
];

export async function createImportWorkflowComponents(
  script: Core.GOScript,
  config: ImportNotificationsConfig,
): Promise<ImportWorkflowComponents> {
  const exportPathInfo = resolveExportPath(script, config);
  const sdk = createSdk(script, config);
  const attachmentsByPratica = await loadAttachments(script, config);
  const importer = createImporter(script, config);
  const exporter = createExporter(script, config, exportPathInfo);

  return {
    attachmentsByPratica,
    exporter,
    exportPathInfo,
    importer,
    worker: new SENDNotificationImportWorker(importer, sdk),
  };
}

export async function executeImportWorkflow(
  script: Core.GOScript,
  config: ImportNotificationsConfig,
  components: ImportWorkflowComponents,
): Promise<void> {
  const csvInputPath = script.paths.resolvePath(config.csvFile, Core.GOPathType.INPUT);
  logWorkflowStart(script, config, csvInputPath);

  const result = await components.worker.process(csvInputPath, {
    concurrency: config.concurrency,
    skipFailedNotifications: false,
    sendNotifications: config.sendNotifications,
    pollForIun: config.pollForIun,
    pollMaxAttempts: config.pollMaxAttempts,
    pollDelayMs: config.pollDelayMs,
    useStreaming: 'auto',
    streamingThresholdMB: config.streamingThresholdMb,
    exporter: components.exporter,
    preserveAllColumns: config.preserveAllColumns,
    exportAllRows: config.exportAllRows,
    includeStatusColumns: config.includeStatusColumns,
    ...(components.attachmentsByPratica !== undefined && { attachmentsByPratica: components.attachmentsByPratica }),
  });

  displayResults(script, result, components.exportPathInfo?.path);
  script.logger.success('Workflow completed successfully');
}

function resolveExportPath(script: Core.GOScript, config: ImportNotificationsConfig): ExportPathInfo {
  const exportPathInfo = script.paths.resolvePathWithInfo(config.exportFile, Core.GOPathType.OUTPUT);
  if (exportPathInfo === undefined) return undefined;

  if (exportPathInfo.isAbsolute) {
    script.logger.info(`Export path (absolute): ${exportPathInfo.path}`);
  } else {
    script.logger.info(`Output directory: ${exportPathInfo.resolvedDir}`);
    script.logger.info(`Export file will be saved to: ${exportPathInfo.path}`);
  }

  return exportPathInfo;
}

function createSdk(script: Core.GOScript, config: ImportNotificationsConfig): SENDNotifications {
  script.logger.section('Initializing SEND SDK');
  const sdk = new SENDNotifications({
    basePath: config.basePath,
    apiKey: config.pnApiKey,
    timeout: 300000,
    debug: false,
    ...(config.proxyUrl !== undefined && { proxyUrl: config.proxyUrl }),
  });

  if (config.proxyUrl) {
    script.logger.info(`Using HTTP proxy: ${config.proxyUrl}`);
  }
  script.logger.success('SDK initialized');

  return sdk;
}

async function loadAttachments(
  script: Core.GOScript,
  config: ImportNotificationsConfig,
): Promise<AttachmentsByPratica | undefined> {
  if (config.attachmentsFile === undefined) return undefined;

  script.logger.section('Loading Uploaded Attachments');
  const attachmentsPath = script.paths.resolvePath(config.attachmentsFile, Core.GOPathType.INPUT);
  script.logger.info(`Attachments file: ${attachmentsPath}`);

  const loadResult = await loadUploadedAttachments(attachmentsPath);
  for (const skipped of loadResult.skipped) {
    script.logger.warning(
      `Skipped attachment "${skipped.filePath || 'unknown'}" (pratica: ${skipped.pratica || 'n/a'}): ${skipped.reason}`,
    );
  }
  if (loadResult.totalAttachments === 0) {
    throw new Error(`No usable attachments found in ${attachmentsPath}`);
  }

  script.logger.success(
    `Loaded ${loadResult.totalAttachments} attachments for ${loadResult.attachmentsByPratica.size} pratiche`,
  );
  return loadResult.attachmentsByPratica;
}

function createImporter(
  script: Core.GOScript,
  config: ImportNotificationsConfig,
): Core.GOCSVListImporter<SENDNotificationRow> {
  script.logger.section('Setting up CSV Importer');
  const importerAdapter = new QATestFormatAdapter();
  return new Core.GOCSVListImporter<SENDNotificationRow>({
    ...importerAdapter.getOptions(),
    preserveOriginalData: config.preserveAllColumns,
  });
}

function createExporter(
  script: Core.GOScript,
  config: ImportNotificationsConfig,
  exportPathInfo: ExportPathInfo,
): Core.GOCSVListExporter<Record<string, unknown>> | undefined {
  if (exportPathInfo === undefined) return undefined;

  script.logger.info(`Export file: ${exportPathInfo.path}`);
  const exporter = new Core.GOCSVListExporter<Record<string, unknown>>({
    outputPath: exportPathInfo.path,
    includeHeader: true,
    delimiter: ',',
    columns: BASE_EXPORT_COLUMNS,
    mergeOriginalColumns: config.preserveAllColumns,
    columnConflictStrategy: 'keep-generated',
    skipInvalidItems: true,
  });

  if (config.preserveAllColumns) {
    script.logger.info('CSV passthrough enabled: all original columns will be preserved');
  }

  return exporter;
}

function logWorkflowStart(script: Core.GOScript, config: ImportNotificationsConfig, csvInputPath: string): void {
  script.logger.section('Starting Import Workflow');
  script.logger.info(`Input file: ${csvInputPath}`);
  script.logger.info(`Send mode: ${config.sendNotifications ? 'LIVE' : 'DRY-RUN'}`);
  script.logger.info(`Concurrency: ${config.concurrency}`);
  script.logger.info(`Poll for IUN: ${config.pollForIun}`);
  script.logger.newline();
}
