/**
 * Validation of the script configuration, before any file is read: the
 * result has literal types, parsed durations and parsed `--defaults`.
 */

import { Core } from '@go-automation/go-common';
import { Dispatch, MAX_PRELOAD_ITEMS } from '@go-automation/go-send';
import type { SENDApiVersion } from '@go-automation/go-send';

import type { DispatchDurations } from '../types/DispatchDurations.js';
import type { DispatchPhaseName } from '../types/DispatchPhaseName.js';
import type { SendDispatchNotificationsConfig } from '../types/SendDispatchNotificationsConfig.js';
import type { ValidatedConfig } from '../types/ValidatedConfig.js';
import type { ValidatedConfigBase } from '../types/ValidatedConfigBase.js';
import { DispatchUsageError } from './DispatchUsageError.js';
import { parseDefaults } from './parseDefaults.js';

const API_VERSIONS: ReadonlySet<string> = new Set<SENDApiVersion>(['v2.4', 'v2.5', 'v2.6']);
const PHASES: ReadonlySet<string> = new Set<DispatchPhaseName>(['send', 'verify', 'request-id']);
const FORMATS: ReadonlySet<string> = new Set<Dispatch.InputFormat>(['csv', 'json', 'jsonl']);
const HTTP_URL = /^https?:\/\//i;
/** Timers must be at least 1 ms (0 would disable them). */
const TIMER = { minMs: 1 } as const;

/**
 * Type guard of the `--api-version` values.
 *
 * @param value - Raw value
 * @returns Whether it is a supported SEND API version
 */
function isSendApiVersion(value: string): value is SENDApiVersion {
  return API_VERSIONS.has(value);
}

/**
 * Type guard of the `--phases` items.
 *
 * @param value - Raw value
 * @returns Whether it is a known phase
 */
function isDispatchPhase(value: string): value is DispatchPhaseName {
  return PHASES.has(value);
}

/**
 * Type guard of the `--input-format` / `--output-format` values.
 *
 * @param value - Raw value
 * @returns Whether it is a supported format
 */
function isInputFormat(value: string): value is Dispatch.InputFormat {
  return FORMATS.has(value);
}

/**
 * Checks the configuration and narrows it: unknown enumeration values,
 * combinations the script does not support (§17) or rejects by design (§13),
 * invalid durations and `--defaults` stop the run before any file is read.
 *
 * @param config - Raw configuration from GOScript
 * @returns The validated configuration, discriminated by `mode`
 * @throws DispatchUsageError with the reason
 *
 * @example
 * ```typescript
 * const config = validateConfig(await script.getConfiguration<SendDispatchNotificationsConfig>());
 * if (config.mode === 'direct') console.log(config.ecBaseUrl);
 * ```
 */
export function validateConfig(config: SendDispatchNotificationsConfig): ValidatedConfig {
  const base = validateBase(config);
  if (config.mode === 'e2e') {
    if (config.ecProduction) throw new DispatchUsageError('--ec-production applies only to --mode direct');
    return { ...base, mode: 'e2e' };
  }
  if (config.mode === 'direct') return validateDirect(config, base);
  throw new DispatchUsageError(`--mode ${config.mode}: use e2e or direct`);
}

function validateBase(config: SendDispatchNotificationsConfig): ValidatedConfigBase {
  validateTuning(config);
  const phases = validatePhases(config.phases);
  if (!isSendApiVersion(config.apiVersion)) {
    throw new DispatchUsageError(`--api-version ${config.apiVersion}: use v2.4, v2.5 or v2.6`);
  }
  const { requestIdSelect, requestIdWait } = config;
  if (requestIdSelect !== 'per-category' && requestIdSelect !== 'priority') {
    throw new DispatchUsageError(`--request-id-select ${requestIdSelect}: use per-category or priority`);
  }
  if (requestIdWait !== 'any' && requestIdWait !== 'all') {
    throw new DispatchUsageError(`--request-id-wait ${requestIdWait}: use any or all`);
  }
  if (config.inputFile === undefined && config.resume === undefined) {
    throw new DispatchUsageError('--input-file is required (or --resume)');
  }
  const inputFormat = optionalFormat(config.inputFormat, '--input-format');
  const outputFormat = optionalFormat(config.outputFormat, '--output-format');
  const {
    mode: _mode,
    inputFormat: _inputFormat,
    outputFormat: _outputFormat,
    apiVersion,
    defaults,
    ecBaseUrl: _ecBaseUrl,
    phases: _phases,
    requestIdSelect: _requestIdSelect,
    requestIdWait: _requestIdWait,
    httpTimeout: _httpTimeout,
    sendTimeout: _sendTimeout,
    verifyInitialDelay: _verifyInitialDelay,
    verifyTimeout: _verifyTimeout,
    requestIdInitialDelay: _requestIdInitialDelay,
    requestIdTimeout: _requestIdTimeout,
    uploadReuseMaxAge: _uploadReuseMaxAge,
    ...rest
  } = config;
  return {
    ...rest,
    ...(inputFormat !== undefined && { inputFormat }),
    ...(outputFormat !== undefined && { outputFormat }),
    apiVersion,
    fieldDefaults: parseDefaults(defaults ?? []),
    phases,
    requestIdSelect,
    requestIdWait,
    durations: parseDurations(config),
  };
}

/**
 * Throughput and concurrency parameters: rejected here, as usage errors, so
 * a bad value never reaches the session (where it would fail with a stack
 * trace, after `run.json` is written, and only in a real run).
 */
function validateTuning(config: SendDispatchNotificationsConfig): void {
  if (config.rate !== undefined && !(Number.isFinite(config.rate) && config.rate > 0)) {
    throw new DispatchUsageError(`--rate ${config.rate}: must be a positive number of calls per second`);
  }
  requirePositiveInteger(config.burst, '--burst');
  requirePositiveInteger(config.maxInFlight, '--max-in-flight');
  requirePositiveInteger(config.uploadConcurrency, '--upload-concurrency');
  requirePositiveInteger(config.dynamodbConcurrency, '--dynamodb-concurrency');
  requirePositiveInteger(config.preloadBatchSize, '--preload-batch-size', MAX_PRELOAD_ITEMS);
}

function requirePositiveInteger(value: number, flag: string, max?: number): void {
  if (!Number.isInteger(value) || value < 1 || (max !== undefined && value > max)) {
    const range = max === undefined ? 'a positive integer' : `an integer from 1 to ${max}`;
    throw new DispatchUsageError(`${flag} ${value}: must be ${range}`);
  }
}

function validatePhases(raw: ReadonlyArray<string>): ReadonlyArray<DispatchPhaseName> {
  const phases: DispatchPhaseName[] = [];
  for (const phase of raw) {
    if (!isDispatchPhase(phase)) throw new DispatchUsageError(`--phases: unknown phase "${phase}"`);
    phases.push(phase);
  }
  if (phases.length === 0) throw new DispatchUsageError('--phases: at least one phase is required');
  return phases;
}

function optionalFormat(value: string | undefined, name: string): Dispatch.InputFormat | undefined {
  if (value === undefined) return undefined;
  if (!isInputFormat(value)) throw new DispatchUsageError(`${name} ${value}: use csv, json or jsonl`);
  return value;
}

/**
 * Parses the duration parameters: timers between 1 ms and the `setTimeout`
 * maximum, `upload.reuse.max.age` (an age) from 0 with no practical maximum.
 *
 * @param config - Raw configuration
 * @returns Durations in milliseconds
 * @throws DispatchUsageError naming the parameter
 */
export function parseDurations(config: SendDispatchNotificationsConfig): DispatchDurations {
  try {
    return {
      httpTimeoutMs: Core.parseDuration(config.httpTimeout, 'http.timeout', TIMER),
      sendTimeoutMs: Core.parseDuration(config.sendTimeout, 'send.timeout', TIMER),
      verifyInitialDelayMs: Core.parseDuration(config.verifyInitialDelay, 'verify.initial.delay', TIMER),
      verifyTimeoutMs: Core.parseDuration(config.verifyTimeout, 'verify.timeout', TIMER),
      requestIdInitialDelayMs: Core.parseDuration(config.requestIdInitialDelay, 'request.id.initial.delay', TIMER),
      requestIdTimeoutMs: Core.parseDuration(config.requestIdTimeout, 'request.id.timeout', TIMER),
      uploadReuseMaxAgeMs: Core.parseDuration(config.uploadReuseMaxAge, 'upload.reuse.max.age', {
        maxMs: Number.MAX_SAFE_INTEGER,
      }),
    };
  } catch (error: unknown) {
    throw new DispatchUsageError(error instanceof Error ? error.message : String(error), { cause: error });
  }
}

/**
 * Checks the `direct` mode: only the `send` phase (verification is open
 * point A7, the requestId comes from the template), a pn-ec base URL with
 * scheme and a valid requestId template.
 */
function validateDirect(config: SendDispatchNotificationsConfig, base: ValidatedConfigBase): ValidatedConfig {
  if (base.phases.includes('verify')) {
    throw new DispatchUsageError(
      '--mode direct: verify is not available yet (A7, to be agreed with the SEND team); use --phases send',
    );
  }
  if (base.phases.includes('request-id')) {
    throw new DispatchUsageError(
      '--mode direct: the requestId comes from the template, --phases request-id does not apply',
    );
  }
  if (config.ecBaseUrl === undefined) {
    throw new DispatchUsageError('--mode direct requires --ec-base-url (tunnel to pn-external-channels)');
  }
  if (!HTTP_URL.test(config.ecBaseUrl.trim())) {
    throw new DispatchUsageError(
      `--ec-base-url "${config.ecBaseUrl}": include the scheme (e.g. http://localhost:8888)`,
    );
  }
  try {
    return {
      ...base,
      mode: 'direct',
      ecBaseUrl: Dispatch.normalizeBasePath(config.ecBaseUrl, '--ec-base-url'),
      requestIdTemplate: Dispatch.RequestIdTemplate.parse(config.directRequestIdTemplate),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DispatchUsageError(message, { cause: error });
  }
}
