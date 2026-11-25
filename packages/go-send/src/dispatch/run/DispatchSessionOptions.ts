import type { SENDApiVersion } from '../../services/notification/models/SENDApiVersion.js';
import type { SENDUploadedAttachment } from '../../workers/import/SENDUploadedAttachment.js';
import type { B2BApi } from '../channels/B2BApi.js';
import type { SafeStorageGateway } from '../documents/SafeStorageGateway.js';
import type { SharedDocumentConfig } from '../environment/SharedDocumentConfig.js';
import type { InputReaderOptions } from '../input/InputReaderOptions.js';
import type { FieldValues } from '../mapping/FieldValues.js';
import type { MappingProfile } from '../mapping/MappingProfile.js';
import type { DispatchClock } from '../model/DispatchClock.js';
import type { DispatchMode } from '../model/DispatchMode.js';
import type { DirectModeOptions } from './DirectModeOptions.js';
import type { TransitionHandler } from '../journal/TransitionHandler.js';
import type { DispatchRequestIdOptions } from './DispatchRequestIdOptions.js';
import type { DispatchRunFiles } from './DispatchRunFiles.js';
import type { DispatchSessionOutput } from './DispatchSessionOutput.js';
import type { RunInfo } from './RunInfo.js';
import type { DispatchSessionTuning } from './DispatchSessionTuning.js';

/**
 * Everything a dispatch session needs, already resolved by the script.
 */
export interface DispatchSessionOptions {
  /** Run id; on resume, the one of the previous session. */
  readonly runId: string;
  /** Files of this session, from GOPaths. */
  readonly files: DispatchRunFiles;
  /** `run.json` of the session being resumed: its journal segments are replayed. */
  readonly previousRun?: RunInfo;
  /** Path of the previous `run.json`, recorded as `resumedFrom`. */
  readonly previousRunInfoPath?: string;
  /** No call at all: no preflight call, no upload, no send. */
  readonly dryRun: boolean;
  readonly input: InputReaderOptions;
  readonly profile: MappingProfile;
  readonly rowKeyColumn?: string;
  readonly cliValues: FieldValues;
  readonly environmentValues: FieldValues;
  /** `sender.taxId` the API key belongs to; rows with another one are invalid. */
  readonly environmentSenderTaxId?: string;
  readonly sharedDocument?: SharedDocumentConfig;
  readonly documentsDir: string;
  readonly attachmentsByPratica?: ReadonlyMap<string, ReadonlyArray<SENDUploadedAttachment>>;
  /** `e2e` (default) or `direct` (§9). */
  readonly mode?: DispatchMode;
  /** SEND B2B API: required in `e2e`. */
  readonly api?: B2BApi;
  /** SafeStorage uploads: required in `e2e` when documents must be uploaded. */
  readonly gateway?: SafeStorageGateway;
  /** Required in `direct` mode. */
  readonly direct?: DirectModeOptions;
  readonly apiVersion: SENDApiVersion;
  /** `send` among the phases; without it the input must carry `preset.*` identifiers (RF-12). */
  readonly send: boolean;
  readonly verify: boolean;
  /** Present when `request-id` is among the phases. */
  readonly requestId?: DispatchRequestIdOptions;
  readonly tuning: DispatchSessionTuning;
  readonly output: DispatchSessionOutput;
  /** Non-secret parameters saved in `run.json`. */
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly clock?: DispatchClock;
  /** Observer of every transition (logging, `--verbose`). */
  readonly onTransition?: TransitionHandler;
}
