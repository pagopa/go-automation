/**
 * Translation of the validated configuration into the options of a
 * `Dispatch.DispatchSession`.
 */

import { createHash } from 'node:crypto';
import * as path from 'node:path';

import { Core } from '@go-automation/go-common';
import { Dispatch, SENDNotifications, SENDTimelineService, loadUploadedAttachments } from '@go-automation/go-send';

import { scriptMetadata } from '../config.js';
import type { DispatchTarget } from '../types/DispatchTarget.js';
import type { LoadedProfile } from '../types/LoadedProfile.js';
import type { PreparedSession } from '../types/PreparedSession.js';
import type { ResolvedRun } from '../types/ResolvedRun.js';
import type { RunIdentity } from '../types/RunIdentity.js';
import type { ValidatedConfig } from '../types/ValidatedConfig.js';
import { AwsCredentialErrorDetector } from './AwsCredentialErrorDetector.js';
import { DispatchUsageError } from './DispatchUsageError.js';
import {
  RUN_IDENTITY_PARAMETER,
  assertSameRunIdentity,
  formatFieldValues,
  formatSharedDocument,
} from './runIdentity.js';
import { TransitionLogger } from './TransitionLogger.js';

/**
 * Calls per second: `--rate`, or 20 in e2e and 5 in direct (§9.2, A8).
 *
 * @param config - Validated configuration
 * @returns The rate
 */
export function effectiveRate(config: Pick<ValidatedConfig, 'rate' | 'mode'>): number {
  return config.rate ?? (config.mode === 'direct' ? 5 : 20);
}

/**
 * Format of the input: `--input-format`, else the file extension, else the
 * profile format.
 *
 * @param explicit - `--input-format`
 * @param filePath - Input file
 * @param profile - Mapping profile
 * @returns The input format
 * @throws DispatchUsageError when no source gives a supported format
 */
export function resolveInputFormat(
  explicit: Dispatch.InputFormat | undefined,
  filePath: string,
  profile: Dispatch.MappingProfile,
): Dispatch.InputFormat {
  const format = explicit ?? Dispatch.InputReader.formatFromPath(filePath) ?? profile.format?.type;
  if (format === undefined) {
    throw new DispatchUsageError(`${filePath}: unknown input format, set --input-format (csv, json or jsonl)`);
  }
  return format;
}

/**
 * Format of the output: `--output-format`, else the format of the input
 * (never the profile format: a JSON input with a CSV profile gives JSON).
 *
 * @param explicit - `--output-format`
 * @param inputFormat - Resolved input format
 * @returns The output format
 */
export function resolveOutputFormat(
  explicit: Dispatch.InputFormat | undefined,
  inputFormat: Dispatch.InputFormat,
): Dispatch.InputFormat {
  return explicit ?? inputFormat;
}

/**
 * Resolves this session: a new run, or the resume of the session named by
 * `--resume` (a directory under the GOPaths outputs dir, or an absolute path).
 * The execution directory of this session always comes from GOPaths.
 *
 * @param script - GOScript instance
 * @param config - Validated configuration
 * @returns Identity, directory and input of the session
 * @throws DispatchUsageError when the `run.json` to resume cannot be read
 */
async function resolveRun(script: Core.GOScript, config: ValidatedConfig): Promise<ResolvedRun> {
  if (config.resume === undefined) {
    const runDir = script.paths.createExecutionOutputDir();
    const inputFile = script.paths.resolvePath(config.inputFile ?? '', Core.GOPathType.INPUT);
    return { runId: Dispatch.createRunId(new Date()), runDir, runName: path.basename(runDir), inputFile };
  }
  const previousDir = path.isAbsolute(config.resume)
    ? config.resume
    : path.join(script.paths.getOutputsBaseDir(), config.resume);
  const previousRunInfoPath = path.join(previousDir, Dispatch.RUN_FILES.info);
  let previousRun: Dispatch.RunInfo;
  try {
    previousRun = await Dispatch.readRunInfo(previousRunInfoPath);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new DispatchUsageError(
      `--resume ${config.resume}: cannot read ${previousRunInfoPath} (${reason}). ` +
        'Only a run with --dry-run=false writes run.json: a dry run has nothing to resume.',
      { cause: error },
    );
  }
  const runDir = script.paths.createExecutionOutputDir();
  const inputFile =
    config.inputFile === undefined
      ? previousRun.inputPath
      : script.paths.resolvePath(config.inputFile, Core.GOPathType.INPUT);
  return {
    runId: previousRun.runId,
    runDir,
    runName: path.basename(runDir),
    inputFile,
    previousRun,
    previousRunInfoPath,
  };
}

/**
 * Loads the mapping profile: a built-in name, or a JSON file (whose content
 * hash becomes part of the run identity).
 *
 * @param script - GOScript instance
 * @param nameOrPath - `--mapping-profile`
 * @returns The validated profile
 */
async function loadMappingProfile(script: Core.GOScript, nameOrPath: string): Promise<LoadedProfile> {
  const builtIn = Dispatch.BUILT_IN_PROFILES.get(nameOrPath);
  if (builtIn !== undefined) return { profile: builtIn };
  const file = script.paths.resolvePath(nameOrPath, Core.GOPathType.CONFIG);
  try {
    const content = await new Core.GOJSONFileImporter<unknown>({ inputPath: file }).import();
    const sha256 = createHash('sha256').update(JSON.stringify(content)).digest('hex');
    return { profile: Dispatch.parseMappingProfile(content, file), sha256 };
  } catch (error: unknown) {
    throw DispatchUsageError.from(error);
  }
}

/**
 * Builds the session options from configuration and target. On resume, the
 * settings that identify the rows must match those of the resumed run.
 *
 * @param script - GOScript instance
 * @param config - Validated configuration
 * @param target - Resolved target
 * @returns Options of the session, identity of the run, `pn-Timelines` profile
 * @throws DispatchUsageError on a resume with different settings, missing
 *   `--aws-profiles` or an unknown input format
 */
export async function createSessionOptions(
  script: Core.GOScript,
  config: ValidatedConfig,
  target: DispatchTarget,
): Promise<PreparedSession> {
  const send = config.phases.includes('send');
  const awsProfile = config.phases.includes('request-id') ? timelinesProfile(config, target) : undefined;
  const run = await resolveRun(script, config);
  const transitions = new TransitionLogger(script.logger, config.verbose);
  const { inputFile } = run;
  const loaded = await loadMappingProfile(script, config.mappingProfile);
  const { profile } = loaded;
  const inputFormat = resolveInputFormat(config.inputFormat, inputFile, profile);
  const outputFormat = resolveOutputFormat(config.outputFormat, inputFormat);
  const { durations } = config;
  const sdk =
    target.b2b === undefined
      ? undefined
      : new SENDNotifications({
          basePath: target.b2b.basePath,
          apiKey: target.b2b.apiKey,
          timeout: durations.httpTimeoutMs,
          ...(config.proxyUrl !== undefined && { proxyUrl: config.proxyUrl }),
        });
  const attachmentsFile =
    config.attachmentsFile === undefined
      ? undefined
      : script.paths.resolvePath(config.attachmentsFile, Core.GOPathType.INPUT);
  // Documents matter only when the session sends: without `send` the rows are presets.
  const attachments =
    send && attachmentsFile !== undefined
      ? await loadUploadedAttachments(attachmentsFile).catch((error: unknown) => {
          throw DispatchUsageError.from(error);
        })
      : undefined;
  // The configured shared document is part of the run identity even when this session does not send.
  const configuredSharedDocument = cliSharedDocument(script, config) ?? target.sharedDocument;
  const sharedDocument = send ? configuredSharedDocument : undefined;
  const delimiter = inputFormat === 'csv' ? profile.format?.delimiter : undefined;
  const documentsDir =
    config.documentsDir === undefined
      ? path.dirname(inputFile)
      : script.paths.resolvePath(config.documentsDir, Core.GOPathType.INPUT);
  const cliValues = cliFieldValues(config);
  const environmentValues = Dispatch.environmentFieldValues(target);

  const identity: RunIdentity = {
    mode: config.mode,
    inputFormat,
    mappingProfile: profile.name,
    mappingProfileSha256: loaded.sha256 ?? '',
    rowKeyColumn: config.rowKeyColumn ?? '',
    directRequestIdTemplate: config.mode === 'direct' ? config.requestIdTemplate.template : '',
    env: target.name,
    endpoint: target.b2b?.basePath ?? target.externalChannels?.baseUrl ?? '',
    cliValues: formatFieldValues(cliValues),
    environmentValues: formatFieldValues(environmentValues),
    sharedDocument: formatSharedDocument(configuredSharedDocument),
    documentsDir,
    attachmentsFile: attachmentsFile ?? '',
  };
  if (run.previousRun !== undefined && run.previousRunInfoPath !== undefined) {
    assertSameRunIdentity(run.previousRun, run.previousRunInfoPath, identity, config.phases);
  }

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
    cliValues,
    environmentValues,
    ...(target.sender !== undefined && { environmentSenderTaxId: target.sender.taxId }),
    ...(sharedDocument !== undefined && { sharedDocument }),
    documentsDir,
    ...(attachments !== undefined && { attachmentsByPratica: attachments.attachmentsByPratica }),
    mode: config.mode,
    ...(sdk !== undefined && {
      api: new Dispatch.B2BChannel(sdk.notifications),
      gateway: new Dispatch.AttachmentServiceGateway(sdk.attachment),
    }),
    ...(config.mode === 'direct' &&
      target.externalChannels !== undefined && {
        direct: {
          api: new Dispatch.ExternalChannelsChannel(
            target.externalChannels.baseUrl,
            target.externalChannels.clientId,
            durations.httpTimeoutMs,
          ),
          requestIdTemplate: config.requestIdTemplate,
        },
      }),
    apiVersion: config.apiVersion,
    send,
    verify: config.phases.includes('verify'),
    ...(awsProfile !== undefined && { requestId: requestIdOptions(script, config, awsProfile) }),
    tuning: {
      rate: effectiveRate(config),
      burst: config.burst,
      rateAdaptive: config.rateAdaptive,
      maxInFlight: config.maxInFlight,
      sendTimeoutMs: durations.sendTimeoutMs,
      retryAmbiguous: config.sendRetryAmbiguous,
      retryFailed: config.retryFailed,
      retryUncertain: config.retryUncertain,
      failFast: config.failFast,
      verifyInitialDelayMs: durations.verifyInitialDelayMs,
      verifyTimeoutMs: durations.verifyTimeoutMs,
      preloadBatchSize: config.preloadBatchSize,
      uploadConcurrency: config.uploadConcurrency,
      uploadReuseMaxAgeMs: durations.uploadReuseMaxAgeMs,
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
    parameters: runParameters(config, target, identity),
    onTransition: (entry: Dispatch.JournalEntry): void => {
      transitions.handle(entry);
    },
  };
  return { run, options, ...(awsProfile !== undefined && { timelinesProfile: awsProfile }) };
}

function cliSharedDocument(script: Core.GOScript, config: ValidatedConfig): Dispatch.SharedDocumentConfig | undefined {
  if (config.documentFile === undefined || config.documentFile.length === 0) return undefined;
  return {
    files: config.documentFile.map((file) => script.paths.resolvePath(file, Core.GOPathType.INPUT)),
    ...(config.documentTitle !== undefined && { title: config.documentTitle }),
  };
}

/**
 * Field values of the command line: `--defaults`, then `--group-id`,
 * `--sender-tax-id` and `--sender-denomination` (which win over `--defaults`).
 *
 * @param config - Validated configuration
 * @returns CLI field values
 */
function cliFieldValues(config: ValidatedConfig): Dispatch.FieldValues {
  const values = new Map<Dispatch.CanonicalField, string>(config.fieldDefaults);
  if (config.groupId !== undefined) values.set('notificationOptions.group', config.groupId);
  if (config.senderTaxId !== undefined) values.set('sender.taxId', config.senderTaxId);
  if (config.senderDenomination !== undefined) values.set('sender.denomination', config.senderDenomination);
  return values;
}

/** Non-secret parameters saved in run.json, with the identity checked on resume. */
function runParameters(
  config: ValidatedConfig,
  target: DispatchTarget,
  identity: RunIdentity,
): Readonly<Record<string, unknown>> {
  return {
    scriptVersion: scriptMetadata.version,
    mode: config.mode,
    env: target.name,
    basePath: target.b2b?.basePath ?? target.externalChannels?.baseUrl ?? null,
    apiKey: target.b2b?.apiKeyLabel ?? null,
    groupId: target.groupId ?? null,
    senderTaxId: target.sender?.taxId ?? null,
    production: target.production,
    apiVersion: config.apiVersion,
    phases: config.phases,
    awsProfiles: config.awsProfiles ?? [],
    mappingProfile: identity.mappingProfile,
    rate: effectiveRate(config),
    burst: config.burst,
    maxInFlight: config.maxInFlight,
    sendRetryAmbiguous: config.sendRetryAmbiguous,
    [RUN_IDENTITY_PARAMETER]: identity,
  };
}

/**
 * Settings of the requestId phase: `pn-Timelines` read with the DynamoDB
 * client of GOScript (`--aws-profiles`, validated at startup), selection
 * rule of §8.3, one credential-error detector for the run.
 */
function requestIdOptions(
  script: Core.GOScript,
  config: ValidatedConfig,
  awsProfile: string,
): Dispatch.DispatchRequestIdOptions {
  const client = script.aws.clients.get(awsProfile).dynamoDB;
  const detector = new AwsCredentialErrorDetector();
  return {
    source: new Dispatch.DynamoTimelineSource(new SENDTimelineService(client)),
    selection: {
      categories: config.requestIdCategories,
      select: config.requestIdSelect,
      wait: config.requestIdWait,
      endCategories: config.requestIdEndCategories ?? Dispatch.DEFAULT_REQUEST_ID_OPTIONS.endCategories,
    },
    initialDelayMs: config.durations.requestIdInitialDelayMs,
    timeoutMs: config.durations.requestIdTimeoutMs,
    concurrency: config.dynamodbConcurrency,
    isCredentialError: detector.isCredentialError,
  };
}

/**
 * Profile of `--aws-profiles` used for `pn-Timelines`: the one the
 * environment declares (`awsProfile`), or the only one given.
 *
 * @param config - Validated configuration
 * @param target - Resolved target
 * @returns The profile
 * @throws DispatchUsageError when no profile is given, the environment
 *   profile is missing, or the choice is ambiguous
 */
export function timelinesProfile(
  config: Pick<ValidatedConfig, 'awsProfiles'>,
  target: Pick<DispatchTarget, 'name' | 'awsProfile'>,
): string {
  const profiles = config.awsProfiles ?? [];
  if (profiles.length === 0) {
    throw new DispatchUsageError('--phases request-id requires --aws-profiles (pn-Timelines)');
  }
  if (target.awsProfile !== undefined) {
    if (!profiles.includes(target.awsProfile)) {
      throw new DispatchUsageError(
        `Environment ${target.name} reads pn-Timelines with profile ${target.awsProfile}: add it to --aws-profiles`,
      );
    }
    return target.awsProfile;
  }
  const [only] = profiles;
  if (profiles.length > 1 || only === undefined) {
    throw new DispatchUsageError(
      '--aws-profiles has several profiles: set awsProfile in the environment to choose one',
    );
  }
  return only;
}
