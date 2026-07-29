/**
 * Interop Verifica Hash Token - Main Logic Module
 *
 * Contains the core business logic for the script.
 * Receives typed dependencies (script + config) for clean separation of concerns.
 */

import * as path from 'node:path';

import { Core } from '@go-automation/go-common';

import {
  buildS3Key,
  calculateFileHash,
  extractCidFromCwResults,
  extractFileNameFromCwResults,
  parseUtcDate,
  unpackP7mZip,
} from './libs/index.js';
import type { InteropVerificaHashTokenConfig } from './types/index.js';

const EXTRACT_FIELD = '@message';

/**
 * Main script execution function
 *
 * This function contains the core business logic, decoupled from
 * script initialization and configuration parsing.
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: Core.GOScript): Promise<void> {
  script.logger.section('Starting Interop Verifica Hash Token');

  // Load configuration
  const config = await script.getConfiguration<InteropVerificaHashTokenConfig>();

  const start = parseUtcDate(config.startUtc);
  const end = parseUtcDate(config.endUtc);
  const timeRange = { start, end };

  // 1. First CloudWatch query to find CID
  script.logger.section('Executing first CloudWatch query...');
  script.prompt.startSpinner('Running CloudWatch query for application logs...');
  const results = await script.aws.services.cloudWatchLogs.query(
    [config.cwLogGroup],
    config.cwQueryApplication,
    timeRange,
  );
  script.prompt.stopSpinner();

  const cid = extractCidFromCwResults(results, EXTRACT_FIELD);
  if (!cid) {
    script.logger.error(`No CID found in CloudWatch logs matching the application query.`);
    return;
  }
  script.logger.info(`Extracted Correlation ID (CID): ${cid}`);

  // 2. Second CloudWatch query using the extracted CID
  script.logger.section('Executing second CloudWatch query...');
  script.prompt.startSpinner(`Running CloudWatch query for CID ${cid}...`);
  const cidQuery = config.cwQueryCid.replace('cid_replace', `"${cid}"`);
  const resultsSecondQuery = await script.aws.services.cloudWatchLogs.query([config.cwLogGroup], cidQuery, timeRange);
  script.prompt.stopSpinner();

  let filenameBase = extractFileNameFromCwResults(resultsSecondQuery, EXTRACT_FIELD);
  if (!filenameBase) {
    script.logger.error('No filename found in CloudWatch logs matching the CID query.');
    return;
  }

  // Strip common extensions to get the base name
  filenameBase = filenameBase.replace('.ndjson', '').replace('.zip', '').replace('.p7m', '');
  script.logger.info(`Extracted filename base: ${filenameBase}`);

  // 3. Resolve S3 Keys
  const s3KeyP7m = buildS3Key(filenameBase, '.ndjson.zip.p7m', config.s3PrefixP7m);
  const s3KeyNdjson = buildS3Key(filenameBase, '.ndjson', config.s3PrefixNdjson);

  // 4. Download files from S3
  const outputDir = script.paths.createExecutionOutputDir();
  const localP7mPath = path.join(outputDir, 'token1.ndjson.zip.p7m');
  const localZipPath = path.join(outputDir, 'token1.ndjson.zip');
  const localPureNdjsonPath = path.join(outputDir, 'token_original.ndjson');

  script.logger.section('Downloading files from S3...');
  script.logger.step(`S3 Bucket (P7M): ${config.s3BucketNameP7m}`);
  script.logger.step(`S3 Key (P7M): ${s3KeyP7m}`);
  script.prompt.startSpinner('Downloading P7M file...');
  await script.aws.services.s3.downloadToFile(config.s3BucketNameP7m, s3KeyP7m, localP7mPath);
  script.prompt.stopSpinner();
  script.logger.info(`Downloaded signed P7M to: ${localP7mPath}`);

  script.logger.step(`S3 Bucket (NDJSON): ${config.s3BucketNameNdjson}`);
  script.logger.step(`S3 Key (NDJSON): ${s3KeyNdjson}`);
  script.prompt.startSpinner('Downloading NDJSON file...');
  await script.aws.services.s3.downloadToFile(config.s3BucketNameNdjson, s3KeyNdjson, localPureNdjsonPath);
  script.prompt.stopSpinner();
  script.logger.info(`Downloaded original NDJSON to: ${localPureNdjsonPath}`);

  // 5. Unpack .p7m file and zip
  script.logger.section('Unpacking and extracting .p7m file...');
  script.prompt.startSpinner('Decrypting and unzipping...');
  const extractedNdjsonPath = unpackP7mZip(localP7mPath, localZipPath, outputDir);
  script.prompt.stopSpinner();
  script.logger.info(`Extracted signed NDJSON content to: ${extractedNdjsonPath}`);

  // 6. Hash verification
  script.logger.section('Verifying SHA-256 hashes...');
  script.prompt.startSpinner('Calculating hashes...');
  const hashExtracted = await calculateFileHash(extractedNdjsonPath);
  const hashOriginal = await calculateFileHash(localPureNdjsonPath);
  script.prompt.stopSpinner();

  script.logger.text(`Extracted file hash: ${hashExtracted}`);
  script.logger.text(`Original file hash:  ${hashOriginal}`);

  if (hashExtracted === hashOriginal) {
    script.logger.success('Hash verification successful! The token content matches.');
  } else {
    script.logger.error('Hash verification failed! The token contents differ.');
  }
}
