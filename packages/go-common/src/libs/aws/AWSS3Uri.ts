const S3_BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

export interface AWSS3UriParts {
  readonly bucket: string;
  readonly key: string;
  readonly uri: string;
}

export class AWSS3Uri {
  static parse(value: string): AWSS3UriParts {
    const trimmed = value.trim();
    let parsed: URL;

    try {
      parsed = new URL(trimmed);
    } catch {
      throw invalidS3UriError();
    }

    if (
      parsed.protocol !== 's3:' ||
      parsed.hostname === '' ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      parsed.search !== '' ||
      parsed.hash !== '' ||
      /\s/.test(trimmed) ||
      !S3_BUCKET_PATTERN.test(parsed.hostname)
    ) {
      throw invalidS3UriError();
    }

    return {
      bucket: parsed.hostname,
      key: trimLeadingSlashes(parsed.pathname),
      uri: trimmed,
    };
  }

  static format(bucket: string, key?: string): string {
    const cleanBucket = bucket.trim();
    if (!S3_BUCKET_PATTERN.test(cleanBucket)) {
      throw invalidS3UriError();
    }

    const cleanKey = key === undefined ? '' : trimLeadingSlashes(key);
    return cleanKey.length > 0 ? `s3://${cleanBucket}/${cleanKey}` : `s3://${cleanBucket}`;
  }

  static joinKey(prefix: string | undefined, fileName: string): string {
    const cleanPrefix = prefix === undefined ? '' : trimSlashes(prefix);
    const cleanFileName = trimLeadingSlashes(fileName);
    return cleanPrefix.length > 0 ? `${cleanPrefix}/${cleanFileName}` : cleanFileName;
  }
}

function trimSlashes(value: string): string {
  let start = 0;
  let end = value.length;

  while (start < end && value.charCodeAt(start) === 47) {
    start++;
  }

  while (end > start && value.charCodeAt(end - 1) === 47) {
    end--;
  }

  return value.slice(start, end);
}

function trimLeadingSlashes(value: string): string {
  let start = 0;

  while (start < value.length && value.charCodeAt(start) === 47) {
    start++;
  }

  return value.slice(start);
}

function invalidS3UriError(): Error {
  return new Error('Invalid S3 URI. Expected a value like s3://bucket/prefix.');
}
