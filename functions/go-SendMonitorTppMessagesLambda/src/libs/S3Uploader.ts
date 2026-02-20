/**
 * S3 upload helper for Lambda CSV report uploads
 *
 * Scans a local directory for files and uploads them to S3.
 * Uses the default credential chain (Lambda execution role).
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * Uploads files from a local directory to an S3 bucket.
 * The S3 client is instantiated once and reused across Lambda invocations.
 */
export class S3Uploader {
  private readonly bucket: string;
  private readonly s3Client: S3Client;

  /**
   * Creates a new S3Uploader instance
   *
   * @param bucket - Target S3 bucket name
   * @param region - AWS region (defaults to AWS_REGION env var)
   */
  constructor(bucket: string, region?: string) {
    this.bucket = bucket;
    this.s3Client = new S3Client({
      region: region ?? process.env['AWS_REGION'] ?? 'eu-south-1',
    });
  }

  /**
   * Uploads a single file to S3
   *
   * @param filePath - Absolute path to the local file
   * @param key - S3 object key
   * @returns The S3 key of the uploaded object
   */
  public async uploadFile(filePath: string, key: string): Promise<string> {
    const body = await fs.readFile(filePath);
    const contentType = filePath.endsWith('.csv') ? 'text/csv' : 'application/octet-stream';

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    return key;
  }

  /**
   * Uploads all files from a local directory to S3 under the given prefix.
   * Non-recursive: only uploads files directly in the directory.
   *
   * @param dirPath - Absolute path to the local directory
   * @param prefix - S3 key prefix (e.g., "reports/tpp-monitor")
   * @returns Array of S3 keys for uploaded files
   */
  public async uploadDirectory(dirPath: string, prefix: string): Promise<string[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(dirPath);
    } catch {
      // Directory doesn't exist or is empty — nothing to upload
      return [];
    }

    const uploaded: string[] = [];

    for (const entry of entries) {
      const filePath = path.join(dirPath, entry);
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        continue;
      }

      const key = `${prefix}/${entry}`;
      await this.uploadFile(filePath, key);
      uploaded.push(key);
    }

    return uploaded;
  }
}
