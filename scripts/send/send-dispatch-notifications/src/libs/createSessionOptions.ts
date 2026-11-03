/**
 * Translation of the script configuration into the options of a
 * `Dispatch.DispatchSession`.
 */

import * as path from 'node:path';

import { Core } from '@go-automation/go-common';
import { Dispatch, SENDNotifications, loadUploadedAttachments } from '@go-automation/go-send';
import type { SENDApiVersion } from '@go-automation/go-send';

import type { DispatchTarget } from '../types/DispatchTarget.js';
import type { PreparedSession } from '../types/PreparedSession.js';
import type { ResolvedRun } from '../types/ResolvedRun.js';
import type { SendDispatchNotificationsConfig } from '../types/SendDispatchNotificationsConfig.js';

const API_VERSIONS: ReadonlySet<string> = new Set<SENDApiVersion>(['v2.4', 'v2.5', 'v2.6']);
const SUPPORTED_PHASES: ReadonlySet<string> = new Set(['send', 'verify']);

/**
 * Checks the combinations the script does not support yet (§17) or rejects
 * by design (§13), before any file is read.
 *
 * @param config - Script configuration
 * @throws Error with the reason
 */
export function assertSupportedConfig(config: SendDispatchNotificationsConfig): void {
  if (config.mode !== 'e2e') {
    throw new Error(`--mode ${config.mode}: only e2e is available (direct mode comes with phase 3)`);
  }
  for (const phase of config.phases) {
    if (phase === 'request-id') throw new Error('--phases request-id comes with phase 2 of the implementation');
    if (!SUPPORTED_PHASES.has(phase)) throw new Error(`--phases: unknown phase "${phase}"`);
  }
  if (!config.phases.includes('send')) throw new Error('--phases without send comes with phase 2 (RF-12)');
  if (!API_VERSIONS.has(config.apiVersion))
    throw new Error(`--api-version ${config.apiVersion}: use v2.4, v2.5 or v2.6`);
  if (config.inputFile === undefined && config.resume === undefined) throw new Error('--input-file is required');
}

/**
 * Resolves this session: a new run, or the resume of the session named by
 * `--resume` (a directory under the GOPaths outputs dir, or an absolute path).
 * The execution directory of this session always comes from GOPaths.
 *
 * @param script - GOScript instance
 * @param config - Script configuration
 * @returns Identity, directory and input of the session
 */
export async function resolveRun(script: Core.GOScript, config: SendDispatchNotificationsConfig): Promise<ResolvedRun> {
  const runDir = script.paths.createExecutionOutputDir();
  const runName = path.basename(runDir);
  if (config.resume === undefined) {
    const inputFile = script.paths.resolvePath(config.inputFile ?? '', Core.GOPathType.INPUT);
    return { runId: Dispatch.createRunId(new Date()), runDir, runName, inputFile };
  }
  const previousDir = path.isAbsolute(config.resume)
    ? config.resume
    : path.join(script.paths.getOutputsBaseDir(), config.resume);
  const previousRunInfoPath = path.join(previousDir, Dispatch.RUN_FILES.info);
  const previousRun = await Dispatch.readRunInfo(previousRunInfoPath);
  const inputFile =
    config.inputFile === undefined
      ? previousRun.inputPath
      : script.paths.resolvePath(config.inputFile, Core.GOPathType.INPUT);
  return { runId: previousRun.runId, runDir, runName, inputFile, previousRun, previousRunInfoPath };
}

/**
 * Loads the mapping profile: a built-in name or a JSON file.
 *
 * @param script - GOScript instance
 * @param nameOrPath - `--mapping-profile`
 * @returns The validated profile
 */
export async function loadMappingProfile(script: Core.GOScript, nameOrPath: string): Promise<Dispatch.MappingProfile> {
  const builtIn = Dispatch.BUILT_IN_PROFILES.get(nameOrPath);
  if (builtIn !== undefined) return builtIn;
  const file = script.paths.resolvePath(nameOrPath, Core.GOPathType.CONFIG);
  const content = await new Core.GOJSONFileImporter<unknown>({ inputPath: file }).import();
  return Dispatch.parseMappingProfile(content, file);
}

/**
 * Builds the session options from configuration and target.
 *
 * @param script - GOScript instance
 * @param config - Script configuration
 * @param target - Resolved target
 * @returns Options of the session and identity of the run
 */
export async function createSessionOptions(
  script: Core.GOScript,
  config: SendDispatchNotificationsConfig,
  target: DispatchTarget,
): Promise<PreparedSession> {
  const run = await resolveRun(script, config);
  const { inputFile } = run;
  const profile = await loadMappingProfile(script, config.mappingProfile);
  const inputFormat = parseFormat(config.inputFormat, inputFile, profile);
  const outputFormat = parseFormat(config.outputFormat, undefined, profile) ?? inputFormat;
  const sdk = new SENDNotifications({
    basePath: target.basePath,
    apiKey: target.apiKey,
    timeout: Core.parseDuration(config.httpTimeout, 'http.timeout'),
    ...(config.proxyUrl !== undefined && { proxyUrl: config.proxyUrl }),
  });
  const attachments =
    config.attachmentsFile === undefined
      ? undefined
      : await loadUploadedAttachments(script.paths.resolvePath(config.attachmentsFile, Core.GOPathType.INPUT));
  const sharedDocument = cliSharedDocument(script, config) ?? target.sharedDocument;
  const delimiter = inputFormat === 'csv' ? profile.format?.delimiter : undefined;

  const options: Dispatch.DispatchSessionOptions = {
    runId: run.runId,
    files: {
      runInfoPath: script.paths.getExecutionOutputFilePath(Dispatch.RUN_FILES.info),
      journalPath: script.paths.getExecutionOutputFilePath(Dispatch.RUN_FILES.journal),
    },
    ...(run.previousRun !== undefined && { previousRun: run.previousRun }),
    ...(run.previousRunInfoPath !== undefined && { previousRunInfoPath: run.previousRunInfoPath }),
    dryRun: config.dryRun,
    input: {
      filePath: inputFile,
      format: inputFormat,
      ...(delimiter !== undefined && { delimiter }),
      ...(profile.format?.skipRows !== undefined && { skipRows: profile.format.skipRows }),
      ...(profile.format?.encoding !== undefined && { encoding: profile.format.encoding }),
    },
    profile,
    ...(config.rowKeyColumn !== undefined && { rowKeyColumn: config.rowKeyColumn }),
    cliValues: cliFieldValues(config),
    environmentValues: environmentValues(target),
    ...(target.sender !== undefined && { environmentSenderTaxId: target.sender.taxId }),
    ...(sharedDocument !== undefined && { sharedDocument }),
    documentsDir:
      config.documentsDir === undefined
        ? path.dirname(inputFile)
        : script.paths.resolvePath(config.documentsDir, Core.GOPathType.INPUT),
    ...(attachments !== undefined && { attachmentsByPratica: attachments.attachmentsByPratica }),
    api: new Dispatch.B2BChannel(sdk.notifications),
    gateway: new Dispatch.AttachmentServiceGateway(sdk.attachment),
    apiVersion: config.apiVersion as SENDApiVersion, // Safe: checked by assertSupportedConfig
    verify: config.phases.includes('verify'),
    tuning: {
      rate: config.rate,
      burst: config.burst,
      rateAdaptive: config.rateAdaptive,
      maxInFlight: config.maxInFlight,
      sendTimeoutMs: Core.parseDuration(config.sendTimeout, 'send.timeout'),
      retryAmbiguous: config.sendRetryAmbiguous,
      retryFailed: config.retryFailed,
      retryUncertain: config.retryUncertain,
      failFast: config.failFast,
      verifyInitialDelayMs: Core.parseDuration(config.verifyInitialDelay, 'verify.initial.delay'),
      verifyTimeoutMs: Core.parseDuration(config.verifyTimeout, 'verify.timeout'),
      preloadBatchSize: config.preloadBatchSize,
      uploadConcurrency: config.uploadConcurrency,
      uploadReuseMaxAgeMs: Core.parseDuration(config.uploadReuseMaxAge, 'upload.reuse.max.age'),
    },
    output: {
      format: outputFormat,
      ...(outputFormat === 'csv' && delimiter !== undefined && { delimiter }),
      outputPath:
        config.outputFile === undefined
          ? script.paths.getExecutionOutputFilePath(`output.${outputFormat}`)
          : script.paths.resolvePath(config.outputFile, Core.GOPathType.OUTPUT),
      reportPath: script.paths.getExecutionOutputFilePath(`report.${outputFormat}`),
      ...(profile.outputColumns !== undefined && { outputColumns: profile.outputColumns }),
      includeStatus: config.outputIncludeStatus,
      onlySuccess: config.outputOnlySuccess,
    },
    parameters: runParameters(config, target, profile),
  };
  return { run, options };
}

function parseFormat(
  explicit: string | undefined,
  filePath: string | undefined,
  profile: Dispatch.MappingProfile,
): Dispatch.InputFormat {
  const value =
    explicit ??
    (filePath === undefined ? undefined : Dispatch.InputReader.formatFromPath(filePath)) ??
    profile.format?.type;
  if (value === 'csv' || value === 'json' || value === 'jsonl') return value;
  throw new Error(`Unknown format "${String(value)}": use csv, json or jsonl`);
}

function cliSharedDocument(
  script: Core.GOScript,
  config: SendDispatchNotificationsConfig,
): Dispatch.SharedDocumentConfig | undefined {
  if (config.documentFile === undefined || config.documentFile.length === 0) return undefined;
  return {
    files: config.documentFile.map((file) => script.paths.resolvePath(file, Core.GOPathType.INPUT)),
    ...(config.documentTitle !== undefined && { title: config.documentTitle }),
  };
}

function cliFieldValues(config: SendDispatchNotificationsConfig): Dispatch.FieldValues {
  const values = new Map<Dispatch.CanonicalField, string>();
  if (config.groupId !== undefined) values.set('notificationOptions.group', config.groupId);
  if (config.senderTaxId !== undefined) values.set('sender.taxId', config.senderTaxId);
  if (config.senderDenomination !== undefined) values.set('sender.denomination', config.senderDenomination);
  return values;
}

function environmentValues(target: DispatchTarget): Dispatch.FieldValues {
  const values = new Map<Dispatch.CanonicalField, string>();
  if (target.sender !== undefined) {
    values.set('sender.taxId', target.sender.taxId);
    values.set('sender.denomination', target.sender.denomination);
  }
  if (target.groupId !== undefined) values.set('notificationOptions.group', target.groupId);
  for (const [field, value] of target.defaults) if (!values.has(field)) values.set(field, value);
  return values;
}

/** Non-secret parameters saved in run.json. */
function runParameters(
  config: SendDispatchNotificationsConfig,
  target: DispatchTarget,
  profile: Dispatch.MappingProfile,
): Readonly<Record<string, unknown>> {
  return {
    scriptVersion: '1.0.0',
    mode: config.mode,
    env: target.name,
    basePath: target.basePath,
    apiKey: target.apiKeyLabel,
    groupId: target.groupId ?? null,
    senderTaxId: target.sender?.taxId ?? null,
    production: target.production,
    apiVersion: config.apiVersion,
    phases: config.phases,
    mappingProfile: profile.name,
    rate: config.rate,
    burst: config.burst,
    maxInFlight: config.maxInFlight,
    sendRetryAmbiguous: config.sendRetryAmbiguous,
  };
}
