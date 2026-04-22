/**
 * AWS S3 Service for file upload, download, and listing
 *
 * Provides a provider-agnostic wrapper around S3Client.
 * Works with both AWSClientProvider (SSO) and Lambda execution role credentials.
 *
 * @example
 * ```typescript
 * // With AWSClientProvider (CLI scripts)
 * const s3 = new AWSS3Service(clientProvider.s3);
 *
 * // With standalone client (Lambda)
 * const s3 = new AWSS3Service(new S3Client({ region: 'eu-south-1' }));
 *
 * // Upload a local file
 * await s3.uploadFile('/tmp/report.csv', 'my-bucket', 'reports/report.csv');
 *
 * // Upload all files in a directory
 * const keys = await s3.uploadDirectory('/tmp/reports', 'my-bucket', 'reports/2024');
 *
 * // Download a file
 * const buffer = await s3.downloadFile('my-bucket', 'reports/report.csv');
 *
 * // List buckets
 * const buckets = await s3.listBuckets();
 * ```
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { GetObjectCommand, ListBucketsCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';

/** MIME type map for common file extensions */
const MIME_TYPES: Readonly<Record<string, string>> = {
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
};

/** Default MIME type for unknown extensions */
const DEFAULT_MIME_TYPE = 'application/octet-stream';

/**
 * Max parallel uploads in uploadDirectory. Bounded to avoid exhausting sockets
 * or triggering S3 throttling on large directories; 5 is a safe default for
 * Lambda's shared network stack.
 */
const UPLOAD_DIRECTORY_CONCURRENCY = 5;

/**
 * Represents an S3 object entry from a listing operation
 */
export interface AWSS3ObjectEntry {
  /** S3 object key */
  readonly key: string;
  /** Object size in bytes */
  readonly size: number;
  /** Last modified timestamp */
  readonly lastModified?: Date;
}

/**
 * Represents an S3 bucket entry from a listing operation
 */
export interface AWSS3BucketEntry {
  /** Bucket name */
  readonly name: string;
  /** Bucket creation date */
  readonly creationDate?: Date;
}

/**
 * Service for S3 file operations: upload, download, and listing.
 *
 * Takes an S3Client as constructor dependency — does not manage credentials.
 * Use AWSClientProvider.s3 or create a standalone S3Client for Lambda.
 *
 * @example
 * ```typescript
 * const s3 = new AWSS3Service(script.aws.s3);
 * await s3.uploadFile('/tmp/data.csv', 'my-bucket', 'exports/data.csv');
 * ```
 */
export class AWSS3Service {
  constructor(private readonly client: S3Client) {}

  // ==========================================================================
  // Upload
  // ==========================================================================

  /**
   * Uploads a local file to S3
   * Complexity: O(1) — single PutObject call
   *
   * @param filePath - Absolute path to the local file
   * @param bucket - Target S3 bucket name
   * @param key - S3 object key
   * @param contentType - Optional MIME type (auto-detected from extension if omitted)
   * @returns The S3 key of the uploaded object
   */
  async uploadFile(filePath: string, bucket: string, key: string, contentType?: string): Promise<string> {
    const body = await fs.readFile(filePath);
    const resolvedContentType = contentType ?? this.inferContentType(filePath);

    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: resolvedContentType,
      }),
    );

    return key;
  }

  /**
   * Uploads a buffer to S3
   * Complexity: O(1) — single PutObject call
   *
   * @param buffer - Data to upload
   * @param bucket - Target S3 bucket name
   * @param key - S3 object key
   * @param contentType - MIME type (defaults to application/octet-stream)
   * @returns The S3 key of the uploaded object
   */
  async uploadBuffer(buffer: Buffer, bucket: string, key: string, contentType?: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType ?? DEFAULT_MIME_TYPE,
      }),
    );

    return key;
  }

  /**
   * Uploads all files from a local directory to S3 under the given prefix.
   * Non-recursive: only uploads files directly in the directory.
   * Complexity: O(N) where N is the number of files in the directory
   *
   * @param dirPath - Absolute path to the local directory
   * @param bucket - Target S3 bucket name
   * @param prefix - S3 key prefix (e.g. "reports/tpp-monitor")
   * @returns Array of S3 keys for uploaded files
   */
  async uploadDirectory(dirPath: string, bucket: string, prefix: string): Promise<string[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(dirPath);
    } catch {
      return [];
    }

    const statResults = await Promise.all(
      entries.map(async (entry) => {
        const filePath = path.join(dirPath, entry);
        const stat = await fs.stat(filePath);
        return { entry, filePath, isFile: stat.isFile() };
      }),
    );

    const fileEntries = statResults.filter((e) => e.isFile);
    const uploaded: string[] = [];

    for (let i = 0; i < fileEntries.length; i += UPLOAD_DIRECTORY_CONCURRENCY) {
      const batch = fileEntries.slice(i, i + UPLOAD_DIRECTORY_CONCURRENCY);
      const keys = await Promise.all(
        batch.map(async ({ filePath, entry }) => {
          const key = `${prefix}/${entry}`;
          await this.uploadFile(filePath, bucket, key);
          return key;
        }),
      );
      uploaded.push(...keys);
    }

    return uploaded;
  }

  // ==========================================================================
  // Download
  // ==========================================================================

  /**
   * Downloads an S3 object as a Buffer
   * Complexity: O(1) — single GetObject call
   *
   * @param bucket - Source S3 bucket name
   * @param key - S3 object key
   * @returns Buffer containing the object data
   * @throws Error if the object does not exist or the response body is empty
   */
  async downloadFile(bucket: string, key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    if (response.Body === undefined) {
      throw new Error(`Empty response body for s3://${bucket}/${key}`);
    }

    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  /**
   * Downloads an S3 object and saves it to a local file
   * Complexity: O(1) — single GetObject call + file write
   *
   * @param bucket - Source S3 bucket name
   * @param key - S3 object key
   * @param outputPath - Absolute path for the output file
   * @returns The output file path
   */
  async downloadToFile(bucket: string, key: string, outputPath: string): Promise<string> {
    const buffer = await this.downloadFile(bucket, key);
    await fs.writeFile(outputPath, buffer);
    return outputPath;
  }

  // ==========================================================================
  // Listing
  // ==========================================================================

  /**
   * Lists all S3 buckets in the account
   * Complexity: O(1) — single ListBuckets call
   *
   * @returns Array of bucket entries
   */
  async listBuckets(): Promise<ReadonlyArray<AWSS3BucketEntry>> {
    const response = await this.client.send(new ListBucketsCommand({}));

    if (!response.Buckets) {
      return [];
    }

    const results: AWSS3BucketEntry[] = [];
    for (const bucket of response.Buckets) {
      if (bucket.Name) {
        results.push({
          name: bucket.Name,
          ...(bucket.CreationDate ? { creationDate: bucket.CreationDate } : {}),
        });
      }
    }
    return results;
  }

  /**
   * Lists objects in a bucket under a given prefix
   * Handles pagination automatically
   * Complexity: O(P) where P is the number of pages
   *
   * @param bucket - S3 bucket name
   * @param prefix - Key prefix to filter objects (optional)
   * @param maxKeys - Maximum number of keys to return per page (default: 1000)
   * @returns Array of object entries
   */
  async listObjects(bucket: string, prefix?: string, maxKeys?: number): Promise<ReadonlyArray<AWSS3ObjectEntry>> {
    const results: AWSS3ObjectEntry[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          MaxKeys: maxKeys ?? 1000,
          ...(prefix ? { Prefix: prefix } : {}),
          ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
        }),
      );

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) {
            results.push({
              key: obj.Key,
              size: obj.Size ?? 0,
              ...(obj.LastModified ? { lastModified: obj.LastModified } : {}),
            });
          }
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return results;
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * Infers MIME type from file extension
   */
  private inferContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] ?? DEFAULT_MIME_TYPE;
  }
}
