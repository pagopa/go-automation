/**
 * SEND SafeStorage S3 Service for downloading files directly from the
 * SafeStorage bucket (confinfo account) using AWS credentials
 */

import { GOBinaryFileExporter } from '@go-automation/go-common/core';
import type { AWSS3Service } from '@go-automation/go-common/aws';

/** SafeStorage URI prefix */
const SAFESTORAGE_URI_PREFIX = 'safestorage://';

/** Substring identifying the SafeStorage bucket name */
const SAFESTORAGE_BUCKET_MARKER = 'safestorage';

/** Substring identifying the SafeStorage staging bucket, which is excluded */
const SAFESTORAGE_STAGING_BUCKET_MARKER = 'staging';

/**
 * Downloads files from the SafeStorage S3 bucket.
 *
 * The bucket is discovered automatically by listing all S3 buckets in the
 * account and selecting the one whose name contains "safestorage" but not
 * "staging" (same approach as pn-troubleshooting/pdf-validator).
 * The resolved bucket name is cached per instance.
 *
 * @example
 * ```typescript
 * const safeStorage = new SENDSafeStorageS3Service(new AWS.AWSS3Service(script.aws.clients.s3));
 *
 * const key = SENDSafeStorageS3Service.extractKey('safestorage://PN_EXTERNAL_LEGAL_FACTS-abc123.bin');
 * await safeStorage.downloadToFile(key, '/tmp/downloads/PN_EXTERNAL_LEGAL_FACTS-abc123.bin');
 * ```
 */
export class SENDSafeStorageS3Service {
  private resolvedBucketName: string | undefined;

  constructor(private readonly s3: AWSS3Service) {}

  /**
   * Checks whether a string is a SafeStorage URI
   *
   * @param value - Value to check
   * @returns true if it starts with safestorage://
   */
  static isSafeStorageUri(value: string): boolean {
    return value.startsWith(SAFESTORAGE_URI_PREFIX);
  }

  /**
   * Extracts the file key from a SafeStorage URI
   *
   * @param uri - URI in the form safestorage://<key>
   * @returns File key without the prefix (the value unchanged if it has no prefix)
   */
  static extractKey(uri: string): string {
    return SENDSafeStorageS3Service.isSafeStorageUri(uri) ? uri.slice(SAFESTORAGE_URI_PREFIX.length) : uri;
  }

  /**
   * Finds the SafeStorage bucket by listing all S3 buckets in the account.
   * Result is cached after the first successful call.
   *
   * @returns Bucket name
   * @throws Error if no suitable bucket is found
   */
  async findBucket(): Promise<string> {
    if (this.resolvedBucketName !== undefined) {
      return this.resolvedBucketName;
    }

    const buckets = await this.s3.listBuckets();
    const bucket = buckets.find(
      (b) => b.name.includes(SAFESTORAGE_BUCKET_MARKER) && !b.name.includes(SAFESTORAGE_STAGING_BUCKET_MARKER),
    );

    if (bucket === undefined) {
      throw new Error('Safe Storage bucket not found. Check that the AWS profile has access to the correct account.');
    }

    this.resolvedBucketName = bucket.name;
    return this.resolvedBucketName;
  }

  /**
   * Downloads a SafeStorage file as a Buffer
   *
   * @param key - SafeStorage file key (without the safestorage:// prefix)
   * @returns Buffer containing the file data
   * @throws Error if the bucket cannot be resolved or the object cannot be read
   */
  async downloadFile(key: string): Promise<Buffer> {
    const bucketName = await this.findBucket();
    return await this.s3.downloadFile(bucketName, key);
  }

  /**
   * Downloads a SafeStorage file and saves it to disk,
   * creating parent directories if needed
   *
   * @param key - SafeStorage file key (without the safestorage:// prefix)
   * @param outputPath - Absolute path for the output file
   * @returns The output file path
   * @throws Error if the download or the file write fails
   */
  async downloadToFile(key: string, outputPath: string): Promise<string> {
    const buffer = await this.downloadFile(key);
    await new GOBinaryFileExporter({ outputPath }).export(buffer);
    return outputPath;
  }
}
