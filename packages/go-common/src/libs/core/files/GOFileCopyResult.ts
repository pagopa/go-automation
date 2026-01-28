/**
 * Result of a single file copy operation
 * Contains detailed information about the copy outcome
 */
export interface GOFileCopyResult {
  /** Original source path of the file */
  readonly sourcePath: string;

  /** Destination path where the file was copied (or would be copied) */
  readonly destinationPath: string;

  /** Whether the copy was successful */
  readonly success: boolean;

  /** Whether the file was actually copied (false if skipped) */
  readonly copied: boolean;

  /** Reason if file was skipped */
  readonly skipReason?: GOFileCopySkipReason | undefined;

  /** File size in bytes */
  readonly sizeBytes: number;

  /** Human-readable file size (e.g., "1.5 MB") */
  readonly sizeHuman: string;

  /** Error message if copy failed */
  readonly error?: string | undefined;

  /** Timestamp when the copy operation was performed */
  readonly timestamp: Date;
}

/**
 * Reasons why a file copy might be skipped
 */
export type GOFileCopySkipReason =
  | 'user_declined' // User chose not to copy when prompted
  | 'size_exceeded' // File exceeds maximum size threshold
  | 'already_exists' // File already exists at destination
  | 'source_not_found' // Source file does not exist
  | 'destination_not_writable'; // Cannot write to destination
