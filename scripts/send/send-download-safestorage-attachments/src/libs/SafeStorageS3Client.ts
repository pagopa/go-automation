/**
 * Safe Storage S3 Client
 *
 * Downloads files directly from the Safe Storage S3 bucket using AWS credentials.
 * Mirrors the approach used in pn-troubleshooting/pdf-validator:
 *  1. List all S3 buckets and find the one whose name contains "safestorage"
 *     (excluding "staging" buckets)
 *  2. Download the object by file key using GetObjectCommand
 */

import path from 'path';

import { GetObjectCommand, ListBucketsCommand, S3Client } from '@aws-sdk/client-s3';
import { Core } from '@go-automation/go-common';
import type { AttachmentDownloadTask } from '../types/AttachmentDownloadTask.js';
import type { DownloadResult } from '../types/DownloadResult.js';

/** Safe Storage URI prefix */
const SAFESTORAGE_PREFIX = 'safestorage://';

/**
 * Downloads files from the Safe Storage S3 bucket using AWS SDK.
 *
 * The bucket is discovered automatically by listing all S3 buckets
 * in the account and selecting the one whose name contains "safestorage"
 * but not "staging".
 *
 * @example
 * ```typescript
 * const client = new SafeStorageS3Client('sso_pn-confinfo-prod', 'eu-south-1');
 *
 * const result = await client.download({
 *   uri: 'safestorage://PN_EXTERNAL_LEGAL_FACTS-abc123.bin',
 *   key: 'PN_EXTERNAL_LEGAL_FACTS-abc123.bin',
 *   outputDir: '/tmp/downloads',
 * });
 * ```
 */
export class SafeStorageS3Client {
  private resolvedBucketName: string | undefined;

  constructor(private readonly s3Client: S3Client) {}

  /**
   * Extracts the file key from a Safe Storage URI.
   *
   * @param uri - URI in the form safestorage://...
   * @returns File key without the prefix
   */
  static extractKey(uri: string): string {
    return uri.replace(SAFESTORAGE_PREFIX, '');
  }

  /**
   * Checks whether a string is a Safe Storage URI.
   *
   * @param value - Value to check
   * @returns true if it starts with safestorage://
   */
  static isSafeStorageUri(value: string): boolean {
    return value.startsWith(SAFESTORAGE_PREFIX);
  }

  /**
   * Finds the Safe Storage bucket by listing all S3 buckets in the account.
   * Result is cached after the first call.
   *
   * @returns Bucket name
   * @throws Error if no suitable bucket is found
   */
  async findSafeStorageBucket(): Promise<string> {
    if (this.resolvedBucketName !== undefined) {
      return this.resolvedBucketName;
    }

    const { Buckets: storageBuckets } = await this.s3Client.send(new ListBucketsCommand({}));

    const bucket = storageBuckets?.find(
      (b) => b.Name !== undefined && b.Name.includes('safestorage') && !b.Name.includes('staging'),
    );

    if (bucket?.Name === undefined) {
      throw new Error('Safe Storage bucket not found. Check that the AWS profile has access to the correct account.');
    }

    this.resolvedBucketName = bucket.Name;
    return this.resolvedBucketName;
  }

  /**
   * Downloads a single attachment from S3 and saves it to disk.
   *
   * @param task - The download task descriptor
   * @returns Download result with success flag and output path or error message
   */
  async download(task: AttachmentDownloadTask): Promise<DownloadResult> {
    try {
      const bucketName = await this.findSafeStorageBucket();

      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: bucketName,
          Key: task.key,
        }),
      );

      if (response.Body === undefined) {
        throw new Error(`Empty response body for key: ${task.key}`);
      }

      const bytes = await response.Body.transformToByteArray();
      const buffer = Buffer.from(bytes);

      const outputPath = path.join(task.outputDir, task.key);
      const exporter = new Core.GOBinaryFileExporter({ outputPath });
      await exporter.export(buffer);

      const successResult: DownloadResult = {
        uri: task.uri,
        key: task.key,
        outputPath,
        success: true,
        ...(task.documentType !== undefined && { documentType: task.documentType }),
        ...(task.sha256 !== undefined && { sha256: task.sha256 }),
        ...(task.keyValue !== undefined && { keyValue: task.keyValue }),
      };
      return successResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      const failResult: DownloadResult = {
        uri: task.uri,
        key: task.key,
        success: false,
        error: errorMessage,
        ...(task.documentType !== undefined && { documentType: task.documentType }),
        ...(task.sha256 !== undefined && { sha256: task.sha256 }),
        ...(task.keyValue !== undefined && { keyValue: task.keyValue }),
      };
      return failResult;
    }
  }

  /**
   * Destroys the underlying S3 client and releases resources.
   */
  destroy(): void {
    this.s3Client.destroy();
  }
}
