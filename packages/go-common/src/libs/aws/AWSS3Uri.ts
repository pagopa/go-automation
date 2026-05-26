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
      key: parsed.pathname.replace(/^\/+/, ''),
      uri: trimmed,
    };
  }

  static format(bucket: string, key?: string): string {
    const cleanBucket = bucket.trim();
    if (!S3_BUCKET_PATTERN.test(cleanBucket)) {
      throw invalidS3UriError();
    }

    const cleanKey = key?.replace(/^\/+/, '') ?? '';
    return cleanKey.length > 0 ? `s3://${cleanBucket}/${cleanKey}` : `s3://${cleanBucket}`;
  }

  static joinKey(prefix: string | undefined, fileName: string): string {
    const cleanPrefix = prefix?.replace(/^\/+|\/+$/g, '') ?? '';
    const cleanFileName = fileName.replace(/^\/+/, '');
    return cleanPrefix.length > 0 ? `${cleanPrefix}/${cleanFileName}` : cleanFileName;
  }
}

function invalidS3UriError(): Error {
  return new Error('Invalid S3 URI. Expected a value like s3://bucket/prefix.');
}
