/**
 * Translation of the script configuration into the options of a
 * `Dispatch.DispatchSession`.
 */

import * as path from 'node:path';

import { Core } from '@go-automation/go-common';
import { Dispatch, SENDNotifications, SENDTimelineService, loadUploadedAttachments } from '@go-automation/go-send';
import type { SENDApiVersion } from '@go-automation/go-send';

import type { DispatchTarget } from '../types/DispatchTarget.js';
import { isAwsCredentialError } from './isAwsCredentialError.js';
import { TransitionLogger } from './TransitionLogger.js';
import type { PreparedSession } from '../types/PreparedSession.js';
import type { ResolvedRun } from '../types/ResolvedRun.js';
import type { SendDispatchNotificationsConfig } from '../types/SendDispatchNotificationsConfig.js';

const API_VERSIONS: ReadonlySet<string> = new Set<SENDApiVersion>(['v2.4', 'v2.5', 'v2.6']);
const SUPPORTED_PHASES: ReadonlySet<string> = new Set(['send', 'verify', 'request-id']);

/**
 * Checks the combinations the script does not support yet (§17) or rejects
 * by design (§13), before any file is read.
 *
 * @param config - Script configuration
 * @throws Error with the reason
 */
export function assertSupportedConfig(config: SendDispatchNotificationsConfig): void {
  if (config.mode !== 'e2e' && config.mode !== 'direct') throw new Error(`--mode ${config.mode}: use e2e or direct`);
  if (config.mode === 'direct') assertDirectConfig(config);
  for (const phase of config.phases) {
    if (!SUPPORTED_PHASES.has(phase)) throw new Error(`--phases: unknown phase "${phase}"`);
  }
  if (config.phases.length === 0) throw new Error('--phases: at least one phase is required');
  if (!API_VERSIONS.has(config.apiVersion))
    throw new Error(`--api-version ${config.apiVersion}: use v2.4, v2.5 or v2.6`);
  if (config.requestIdSelect !== 'per-category' && config.requestIdSelect !== 'priority') {
    throw new Error(`--request-id-select ${config.requestIdSelect}: use per-category or priority`);
  }
  if (config.requestIdWait !== 'any' && config.requestIdWait !== 'all') {
    throw new Error(`--request-id-wait ${config.requestIdWait}: use any or all`);
  }
  if (config.inputFile === undefined && config.resume === undefined) throw new Error('--input-file is required');
}

/**
 * Checks the `direct` mode: only the `send` phase (verification is open
 * point A7, requestId comes from the template), a pn-ec base URL and a valid
 * requestId template.
 *
 * @param config - Script configuration
 * @throws Error with the reason
 */
function assertDirectConfig(config: SendDispatchNotificationsConfig): void {
  if (config.phases.includes('verify')) {
    throw new Error(
      '--mode direct: verify is not available yet (A7, to be agreed with the SEND team); use --phases send',
    );
  }
  if (config.phases.includes('request-id')) {
    throw new Error('--mode direct: the requestId comes from the template, --phases request-id does not apply');
  }
  if (config.ecBaseUrl === undefined)
    throw new Error('--mode direct requires --ec-base-url (tunnel to pn-external-channels)');
  Dispatch.RequestIdTemplate.parse(config.directRequestIdTemplate);
}

/** Calls per second: `--rate`, or 20 in e2e and 5 in direct (§9.2, A8). */
export function effectiveRate(config: SendDispatchNotificationsConfig): number {
  return config.rate ?? (config.mode === 'direct' ? 5 : 20);
}

/**
 * Parses `--defaults campo=valore` into canonical field values (RF-04).
 *
 * @param entries - Raw entries
 * @returns Field values
 * @throws Error on malformed entries or unknown fields
 */
export function parseDefaults(entries: ReadonlyArray<string>): Map<Dispatch.CanonicalField, string> {
  const values = new Map<Dispatch.CanonicalField, string>();
  for (const entry of entries) {
    const separator = entry.indexOf('=');
    const field = separator < 0 ? entry : entry.slice(0, separator).trim();
    const value = separator < 0 ? '' : entry.slice(separator + 1).trim();
    if (!Dispatch.isCanonicalField(field)) throw new Error(`--defaults: unknown field "${field}"`);
    if (value === '') throw new Error(`--defaults: missing value for ${field} (use ${field}=value)`);
    values.set(field, value);
  }
  return values;
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
async function resolveRun(script: Core.GOScript, config: SendDispatchNotificationsConfig): Promise<ResolvedRun> {
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
async function loadMappingProfile(script: Core.GOScript, nameOrPath: string): Promise<Dispatch.MappingProfile> {
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
  const transitions = new TransitionLogger(script.logger, config.verbose);
  const { inputFile } = run;
  const profile = await loadMappingProfile(script, config.mappingProfile);
  const inputFormat = parseFormat(config.inputFormat, inputFile, profile);
  const outputFormat = parseFormat(config.outputFormat, undefined, profile) ?? inputFormat;
  const httpTimeoutMs = Core.parseDuration(config.httpTimeout, 'http.timeout');
  const sdk =
    config.mode === 'direct'
      ? undefined
      : new SENDNotifications({
          basePath: target.basePath,
          apiKey: target.apiKey,
          timeout: httpTimeoutMs,
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
    mode: config.mode === 'direct' ? 'direct' : 'e2e',
    ...(sdk !== undefined && {
      api: new Dispatch.B2BChannel(sdk.notifications),
      gateway: new Dispatch.AttachmentServiceGateway(sdk.attachment),
    }),
    ...(config.mode === 'direct' && {
      direct: {
        api: new Dispatch.ExternalChannelsChannel(config.ecBaseUrl ?? '', config.ecClientId, httpTimeoutMs),
        requestIdTemplate: Dispatch.RequestIdTemplate.parse(config.directRequestIdTemplate),
      },
    }),
    apiVersion: config.apiVersion as SENDApiVersion, // Safe: checked by assertSupportedConfig
    send: config.phases.includes('send'),
    verify: config.phases.includes('verify'),
    ...(config.phases.includes('request-id') && { requestId: requestIdOptions(script, config, target) }),
    tuning: {
      rate: effectiveRate(config),
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
    onTransition: (entry: Dispatch.JournalEntry): void => {
      transitions.handle(entry);
    },
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
  const values = parseDefaults(config.defaults ?? []);
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
    awsProfiles: config.awsProfiles ?? [],
    mappingProfile: profile.name,
    rate: effectiveRate(config),
    burst: config.burst,
    maxInFlight: config.maxInFlight,
    sendRetryAmbiguous: config.sendRetryAmbiguous,
  };
}

/**
 * Settings of the requestId phase: `pn-Timelines` read with the DynamoDB
 * client of GOScript (`--aws-profiles`, validated at startup), selection
 * rule of §8.3.
 */
function requestIdOptions(
  script: Core.GOScript,
  config: SendDispatchNotificationsConfig,
  target: DispatchTarget,
): Dispatch.DispatchRequestIdOptions {
  const client = script.aws.clients.get(timelinesProfile(config, target)).dynamoDB;
  return {
    source: new Dispatch.DynamoTimelineSource(new SENDTimelineService(client)),
    selection: {
      categories: config.requestIdCategories,
      select: config.requestIdSelect === 'priority' ? 'priority' : 'per-category',
      wait: config.requestIdWait === 'all' ? 'all' : 'any',
      endCategories: config.requestIdEndCategories ?? Dispatch.DEFAULT_REQUEST_ID_OPTIONS.endCategories,
    },
    initialDelayMs: Core.parseDuration(config.requestIdInitialDelay, 'request.id.initial.delay'),
    timeoutMs: Core.parseDuration(config.requestIdTimeout, 'request.id.timeout'),
    concurrency: config.dynamodbConcurrency,
    isCredentialError: isAwsCredentialError,
  };
}

/**
 * Profile of `--aws-profiles` used for `pn-Timelines`: the one the
 * environment declares (`awsProfile`), or the only one given.
 *
 * @param config - Script configuration
 * @param target - Resolved target
 * @returns The profile
 * @throws Error when no profile is given, the environment profile is missing, or the choice is ambiguous
 */
export function timelinesProfile(config: SendDispatchNotificationsConfig, target: DispatchTarget): string {
  const profiles = config.awsProfiles ?? [];
  if (profiles.length === 0) throw new Error('--phases request-id requires --aws-profiles (pn-Timelines)');
  if (target.awsProfile !== undefined) {
    if (!profiles.includes(target.awsProfile)) {
      throw new Error(
        `Environment ${target.name} reads pn-Timelines with profile ${target.awsProfile}: add it to --aws-profiles`,
      );
    }
    return target.awsProfile;
  }
  const [only] = profiles;
  if (profiles.length > 1 || only === undefined) {
    throw new Error('--aws-profiles has several profiles: set awsProfile in the environment to choose one');
  }
  return only;
}
