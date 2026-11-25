import type { SharedDocumentConfig } from '../environment/SharedDocumentConfig.js';
import type { LocalDocumentInspector } from './LocalDocumentInspector.js';
import type { UploadStage } from './UploadStage.js';

/**
 * Options of `DocumentResolver.prepareShared`.
 */
export interface PrepareSharedOptions {
  /** Shared document of the CLI or of the environment. */
  readonly config: SharedDocumentConfig;
  readonly inspector: LocalDocumentInspector;
  /** Absent in a dry run, or when no SafeStorage gateway is configured. */
  readonly uploadStage?: UploadStage;
  /**
   * Dry run: without an upload stage, files get a placeholder key instead of
   * an upload. Outside a dry run a missing upload stage is a `CONFIGURATION`
   * error: placeholders must never reach SEND.
   */
  readonly placeholders: boolean;
}
