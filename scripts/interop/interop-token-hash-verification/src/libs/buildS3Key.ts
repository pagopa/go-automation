/**
 * Builds the S3 key prefixing the path correctly if not already present
 */
export function buildS3Key(filenameBase: string, extension: string, prefix?: string): string {
  const cleanPrefix = prefix?.trim().replace(/\/$/, '');
  if (!cleanPrefix) {
    return `${filenameBase}${extension}`;
  }
  if (filenameBase.startsWith(`${cleanPrefix}/`)) {
    return `${filenameBase}${extension}`;
  }
  return `${cleanPrefix}/${filenameBase}${extension}`;
}
