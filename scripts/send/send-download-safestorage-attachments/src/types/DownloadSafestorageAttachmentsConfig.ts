/**
 * Input mode: plain URI list or structured JSONL
 */
export type InputMode = 'uri-list' | 'jsonl';

/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface DownloadSafestorageAttachmentsConfig {
  /** Path del file di input */
  readonly inputFile: string;

  /** Modalità input: uri-list o jsonl */
  readonly inputMode: InputMode;

  /** AWS SSO profile con accesso al bucket Safe Storage */
  readonly awsProfile: string;

  /**
   * Estensioni file ammesse (es. "pdf,txt,bin").
   * Se undefined, vengono scaricati tutti gli attachment.
   */
  readonly fileExtensions?: string;
}
