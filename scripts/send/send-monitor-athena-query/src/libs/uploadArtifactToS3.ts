import { AWS } from '@go-automation/go-common';

import type { ReportArtifact } from '../types/index.js';

export async function uploadArtifactToS3(
  artifact: ReportArtifact,
  location: string | undefined,
  s3: AWS.AWSS3Service,
): Promise<ReportArtifact> {
  const trimmedLocation = location?.trim();
  if (trimmedLocation === undefined || trimmedLocation.length === 0) {
    return artifact;
  }

  const parsed = AWS.AWSS3Uri.parse(trimmedLocation);
  const key = AWS.AWSS3Uri.joinKey(parsed.key, artifact.fileName);
  await s3.uploadFile(artifact.filePath, parsed.bucket, key, contentTypeForFormat(artifact.format));

  return {
    ...artifact,
    s3Uri: AWS.AWSS3Uri.format(parsed.bucket, key),
  };
}

function contentTypeForFormat(format: ReportArtifact['format']): string {
  switch (format) {
    case 'csv':
      return 'text/csv';
    case 'json':
      return 'application/json';
    case 'jsonl':
      return 'application/x-ndjson';
  }
}
