/**
 * Send Download Safestorage Attachments - Main Logic Module
 *
 * Supports two input modes:
 *  - "uri-list"  : plain text file, one safestorage:// URI per line
 *  - "jsonl"     : JSONL file where each row contains a record with nested attachments;
 *                  the `keyValue` field is used as a sub-folder name for the downloaded files
 *
 * Files are downloaded directly from the Safe Storage S3 bucket via AWS SDK,
 * using the AWS profile configured with access to the confinfo account.
 */

import path from 'path';

import { Core } from '@go-automation/go-common';
import { SafeStorageS3Client } from './libs/SafeStorageS3Client.js';
import type { Attachment } from './types/Attachment.js';
import type { DownloadSafestorageAttachmentsConfig, InputMode } from './types/DownloadSafestorageAttachmentsConfig.js';
import type { AttachmentDownloadTask } from './types/AttachmentDownloadTask.js';
import type { DownloadResult } from './types/DownloadResult.js';

// ============================================================================
// JSONL record shape (partial – only the fields we need)
// ============================================================================

interface PaperProgrStatus {
  readonly attachments: ReadonlyArray<Attachment>;
}

interface EventEntry {
  readonly paperProgrStatus: PaperProgrStatus | null;
}

interface ItemRecord {
  readonly eventsList: ReadonlyArray<EventEntry>;
}

interface JsonlRecord {
  readonly keyValue: string;
  readonly items: ReadonlyArray<ItemRecord>;
}

// ============================================================================
// Task builders
// ============================================================================

/**
 * Builds download tasks from a plain URI list (one safestorage:// per line).
 *
 * Complexity: O(N) where N is the number of URIs.
 *
 * @param uris - List of Safe Storage URI strings
 * @param baseOutputDir - Root output directory for this execution
 * @returns Array of download tasks, one per valid URI
 */
function buildTasksFromUriList(
  uris: ReadonlyArray<string>,
  baseOutputDir: string,
): ReadonlyArray<AttachmentDownloadTask> {
  const tasks: AttachmentDownloadTask[] = [];

  for (const uri of uris) {
    if (!SafeStorageS3Client.isSafeStorageUri(uri)) {
      continue;
    }

    tasks.push({
      uri,
      key: SafeStorageS3Client.extractKey(uri),
      outputDir: baseOutputDir,
    });
  }

  return tasks;
}

/**
 * Extracts all attachments from a JSONL record and builds download tasks.
 * Each record's attachments are placed in a sub-folder named after `keyValue`.
 *
 * Complexity: O(I × E × A) where I = items, E = events, A = attachments per event.
 *
 * @param record - Parsed JSONL record
 * @param baseOutputDir - Root output directory for this execution
 * @returns Array of download tasks for all attachments in the record
 */
function buildTasksFromJsonlRecord(record: JsonlRecord, baseOutputDir: string): ReadonlyArray<AttachmentDownloadTask> {
  const tasks: AttachmentDownloadTask[] = [];
  const subDir = path.join(baseOutputDir, sanitizeFolderName(record.keyValue));

  for (const item of record.items) {
    for (const event of item.eventsList) {
      const attachments = event.paperProgrStatus?.attachments ?? [];

      for (const attachment of attachments) {
        if (!SafeStorageS3Client.isSafeStorageUri(attachment.uri)) {
          continue;
        }

        tasks.push({
          uri: attachment.uri,
          key: SafeStorageS3Client.extractKey(attachment.uri),
          outputDir: subDir,
          documentType: attachment.documentType,
          sha256: attachment.sha256,
          keyValue: record.keyValue,
        });
      }
    }
  }

  return tasks;
}

/**
 * Sanitizes a string so it can be safely used as a file-system folder name.
 *
 * @param name - Raw folder name candidate
 * @returns Safe folder name
 */
function sanitizeFolderName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_');
}

// ============================================================================
// Input loading
// ============================================================================

/**
 * Loads download tasks from a plain URI list file.
 *
 * @param inputFile - Path to the URI list file
 * @param baseOutputDir - Root output directory
 * @param prompt - GOPrompt for spinner feedback
 * @returns Array of resolved download tasks
 */
async function loadTasksFromUriList(
  inputFile: string,
  baseOutputDir: string,
  prompt: Core.GOPrompt,
): Promise<ReadonlyArray<AttachmentDownloadTask>> {
  const importer = new Core.GOFileListImporter<string>({
    trim: true,
    skipEmptyLines: true,
    commentPrefix: '#',
    deduplicate: true,
    rowValidator: (line) => {
      if (!SafeStorageS3Client.isSafeStorageUri(line)) {
        throw new Error(`Not a Safe Storage URI: ${line}`);
      }
    },
    skipInvalidItems: true,
  });

  importer.on('import:started', (event) => {
    prompt.spinLog(`Importing URI list from: ${event.source}`);
  });

  importer.on('import:completed', (event) => {
    prompt.spinSucceed('import', `URI list imported: ${event.totalItems} URIs (${event.duration}ms)`);
  });

  const result = await importer.import(inputFile);
  return buildTasksFromUriList(result.items, baseOutputDir);
}

/**
 * Loads download tasks from a JSONL file.
 * Each JSONL row must contain a `keyValue` field and nested `items` with `eventsList`.
 *
 * @param inputFile - Path to the JSONL file
 * @param baseOutputDir - Root output directory
 * @param prompt - GOPrompt for spinner feedback
 * @returns Array of resolved download tasks (one per attachment across all records)
 */
async function loadTasksFromJsonl(
  inputFile: string,
  baseOutputDir: string,
  prompt: Core.GOPrompt,
): Promise<ReadonlyArray<AttachmentDownloadTask>> {
  const importer = new Core.GOJSONListImporter<JsonlRecord>({
    jsonl: true,
    skipInvalidItems: true,
  });

  importer.on('import:started', (event) => {
    prompt.spinLog(`Importing JSONL from: ${event.source}`);
  });

  importer.on('import:completed', (event) => {
    prompt.spinSucceed('import', `JSONL imported: ${event.totalItems} records (${event.duration}ms)`);
  });

  const result = await importer.import(inputFile);

  const allTasks: AttachmentDownloadTask[] = [];
  for (const record of result.items) {
    for (const task of buildTasksFromJsonlRecord(record, baseOutputDir)) {
      allTasks.push(task);
    }
  }

  return allTasks;
}

/**
 * Loads download tasks from the input file according to the configured mode.
 *
 * @param config - Script configuration
 * @param inputFilePath - Resolved absolute path to the input file
 * @param baseOutputDir - Root output directory for this execution
 * @param prompt - GOPrompt for spinner feedback
 * @returns Array of resolved download tasks
 */
async function loadTasks(
  config: DownloadSafestorageAttachmentsConfig,
  inputFilePath: string,
  baseOutputDir: string,
  prompt: Core.GOPrompt,
): Promise<ReadonlyArray<AttachmentDownloadTask>> {
  const mode: InputMode = config.inputMode;

  switch (mode) {
    case 'uri-list':
      return loadTasksFromUriList(inputFilePath, baseOutputDir, prompt);
    case 'jsonl':
      return loadTasksFromJsonl(inputFilePath, baseOutputDir, prompt);
    default: {
      const exhaustive: never = mode;
      throw new Error(`Unknown input mode: ${String(exhaustive)}`);
    }
  }
}

// ============================================================================
// Extension filter
// ============================================================================

/**
 * Parses the comma-separated extension string into a normalised Set.
 * Extensions are lowercased and stripped of any leading dot.
 *
 * @param raw - Raw string from config (e.g. "pdf,txt,.bin")
 * @returns Set of lowercase extensions without dots (e.g. {"pdf","txt","bin"})
 */
function parseExtensions(raw: string): ReadonlySet<string> {
  const extensions = new Set<string>();
  for (const part of raw.split(',')) {
    const ext = part.trim().toLowerCase().replace(/^\./, '');
    if (ext.length > 0) {
      extensions.add(ext);
    }
  }
  return extensions;
}

/**
 * Filters download tasks by file extension.
 *
 * When `allowedExtensions` is empty the function returns the original array
 * unchanged (no filter configured).
 *
 * Complexity: O(N) where N is the number of tasks.
 *
 * @param tasks - All resolved download tasks
 * @param allowedExtensions - Set of lowercase extensions without dots
 * @returns Filtered subset of tasks whose file key extension is in the allowed set
 */
function filterTasksByExtension(
  tasks: ReadonlyArray<AttachmentDownloadTask>,
  allowedExtensions: ReadonlySet<string>,
): ReadonlyArray<AttachmentDownloadTask> {
  if (allowedExtensions.size === 0) {
    return tasks;
  }

  return tasks.filter((task) => {
    const dotIndex = task.key.lastIndexOf('.');
    if (dotIndex === -1) {
      return false;
    }
    const ext = task.key.slice(dotIndex + 1).toLowerCase();
    return allowedExtensions.has(ext);
  });
}

// ============================================================================
// Download execution
// ============================================================================

/**
 * Runs all download tasks sequentially and reports progress.
 *
 * @param tasks - Tasks to execute
 * @param client - SafeStorageS3Client instance
 * @param prompt - GOPrompt for spinner feedback
 * @returns Array of download results
 */
async function runDownloads(
  tasks: ReadonlyArray<AttachmentDownloadTask>,
  client: SafeStorageS3Client,
  prompt: Core.GOPrompt,
): Promise<ReadonlyArray<DownloadResult>> {
  const results: DownloadResult[] = [];
  let completed = 0;

  for (const task of tasks) {
    const percentage = Math.round((completed / tasks.length) * 100);
    prompt.spin(
      'downloading',
      `[${percentage}%] ${task.key}${task.keyValue !== undefined ? ` (${task.keyValue})` : ''}`,
    );

    const result = await client.download(task);
    results.push(result);
    completed += 1;

    if (result.success) {
      prompt.spinLog(`\x1b[32m✓\x1b[0m ${task.key}`);
    } else {
      prompt.spinLog(`\x1b[31m✗\x1b[0m ${task.key}: ${result.error ?? 'unknown error'}`);
    }
  }

  return results;
}

// ============================================================================
// Results display
// ============================================================================

/**
 * Displays a summary table of the download results.
 *
 * @param script - GOScript for logging
 * @param results - Download results to summarize
 * @param reportPath - Path where the JSONL report was saved
 */
function displayResults(script: Core.GOScript, results: ReadonlyArray<DownloadResult>, reportPath: string): void {
  script.logger.newline();
  script.logger.section('Download Results');

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  const stats = [
    { label: 'Total attachments', value: results.length },
    { label: 'Downloaded', value: successful },
    { label: 'Failed', value: failed },
    { label: 'Report', value: reportPath },
  ];

  script.logger.table({
    columns: [
      { header: 'Metric', key: 'label' },
      { header: 'Value', key: 'value' },
    ],
    data: stats,
    border: true,
  });

  if (failed > 0) {
    script.logger.newline();
    script.logger.warning(`${failed} download(s) failed:`);
    for (const r of results.filter((res) => !res.success)) {
      script.logger.error(`  - ${r.key}: ${r.error ?? 'unknown error'}`);
    }
  }
}

// ============================================================================
// Main function
// ============================================================================

/**
 * Main script execution function.
 *
 * Loads attachments from the configured input file, downloads each one directly
 * from the Safe Storage S3 bucket using AWS credentials, saves them to the
 * execution output directory, and exports a JSONL report with the results.
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: Core.GOScript): Promise<void> {
  script.logger.section('Starting Send Download Safestorage Attachments');

  const config = await script.getConfiguration<DownloadSafestorageAttachmentsConfig>();

  const inputFilePath = script.paths.resolvePath(config.inputFile, Core.GOPathType.INPUT);
  script.logger.info(`Input file  : ${inputFilePath}`);
  script.logger.info(`Input mode  : ${config.inputMode}`);
  script.logger.info(`AWS profile : ${config.awsProfile}`);

  const allowedExtensions = config.fileExtensions !== undefined ? parseExtensions(config.fileExtensions) : new Set<string>();
  if (allowedExtensions.size > 0) {
    script.logger.info(`Filter ext  : ${[...allowedExtensions].join(', ')}`);
  }

  const outputDir = script.paths.createExecutionOutputDir();
  script.logger.info(`Output dir  : ${outputDir}`);

  const reportFilePath = script.paths.getExecutionOutputFilePath('download-report.jsonl');
  const s3Client = new SafeStorageS3Client(script.aws.s3);
  const exporter = new Core.GOJSONListExporter<DownloadResult>({ outputPath: reportFilePath, jsonl: true });
  script.prompt.startSpinner('Loading input file...');

  try {
    // Discover the Safe Storage bucket once upfront so any auth error is caught early
    script.prompt.spinLog('Resolving Safe Storage bucket...');
    const bucketName = await s3Client.findSafeStorageBucket();
    script.prompt.spinLog(`Safe Storage bucket: ${bucketName}`);

    // Load tasks from input file
    const allTasks = await loadTasks(config, inputFilePath, outputDir, script.prompt);
    const tasks = filterTasksByExtension(allTasks, allowedExtensions);

    if (allTasks.length === 0) {
      script.prompt.stopSpinner();
      script.logger.warning('No Safe Storage attachments found in input file. Nothing to download.');
      return;
    }

    if (tasks.length === 0) {
      script.prompt.stopSpinner();
      script.logger.warning(
        `No attachments match the extension filter [${[...allowedExtensions].join(', ')}]. ` +
          `Found ${allTasks.length} attachment(s) with other extensions.`,
      );
      return;
    }

    if (allowedExtensions.size > 0 && tasks.length < allTasks.length) {
      script.logger.info(`Extension filter: ${tasks.length} of ${allTasks.length} attachment(s) selected`);
    } else {
      script.logger.info(`Found ${tasks.length} attachment(s) to download`);
    }
    script.logger.newline();

    // Download all attachments
    const results = await runDownloads(tasks, s3Client, script.prompt);

    script.prompt.spinSucceed('downloading', `Downloads completed: ${results.length} processed`);

    // Export results report
    await exporter.export(results);
    script.logger.info(`Report saved to: ${reportFilePath}`);

    displayResults(script, results, reportFilePath);

    script.logger.success('Done');
  } finally {
    script.prompt.stopSpinner();
    s3Client.destroy();
  }
}
