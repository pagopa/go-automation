import { type AWSS3Service, AWSS3Uri } from '@pagopa/go-aws/s3';
import { valueToString } from '@pagopa/go-common/utils';

import type { ReportArtifact, ReportFormat } from '../types/index.js';

export async function uploadArtifactToS3(
  artifact: ReportArtifact,
  location: string | undefined,
  s3: AWSS3Service,
): Promise<ReportArtifact> {
  const trimmedLocation = location?.trim();
  if (trimmedLocation === undefined || trimmedLocation.length === 0) {
    return artifact;
  }

  const parsed = AWSS3Uri.parse(trimmedLocation);
  const key = AWSS3Uri.joinKey(parsed.key, artifact.fileName);
  await s3.uploadFile(artifact.filePath, parsed.bucket, key, contentTypeForFormat(artifact.format));

  return {
    ...artifact,
    s3Uri: AWSS3Uri.format(parsed.bucket, key),
  };
}

function contentTypeForFormat(format: ReportFormat): string {
  switch (format) {
    case 'csv':
      return 'text/csv';
    case 'json':
      return 'application/json';
    case 'jsonl':
      return 'application/x-ndjson';
    default:
      throw new Error(`Unsupported report format: ${valueToString(format)}`);
  }
}
