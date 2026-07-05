import { GetObjectCommand, HeadObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { serializeCatalog } from './catalog.js';
import type { AutomaticRunbookCatalogV1 } from './external.js';
import { validateAutomaticRunbookCatalog } from './external.js';

export interface CurrentCatalog {
  readonly catalog: AutomaticRunbookCatalogV1;
  readonly etag: string;
  readonly versionId?: string;
}

export async function readCurrentCatalog(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<CurrentCatalog | undefined> {
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, VersionId: head.VersionId }));
    const catalog = JSON.parse(await object.Body!.transformToString()) as AutomaticRunbookCatalogV1;
    validateAutomaticRunbookCatalog(catalog);
    if (head.ETag === undefined) throw new Error('Current catalog has no ETag');
    return { catalog, etag: head.ETag, ...(head.VersionId === undefined ? {} : { versionId: head.VersionId }) };
  } catch (error: unknown) {
    if (error instanceof NoSuchKey || isNotFound(error)) return undefined;
    throw error;
  }
}

export async function publishCatalog(
  client: S3Client,
  bucket: string,
  key: string,
  catalog: AutomaticRunbookCatalogV1,
  expectedEtag: string | undefined,
): Promise<CurrentCatalog> {
  validateAutomaticRunbookCatalog(catalog);
  const body = serializeCatalog(catalog);
  const result = await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
      CacheControl: 'no-cache',
      Metadata: { catalogrevision: catalog.revision, artifactrevision: catalog.worker.artifactRevision },
      ...(expectedEtag === undefined ? { IfNoneMatch: '*' } : { IfMatch: expectedEtag }),
    }),
  );
  const verified = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, VersionId: result.VersionId }));
  const remoteBody = await verified.Body!.transformToString();
  if (remoteBody !== body) throw new Error('Published catalog bytes do not match the generated catalog');
  const etag = result.ETag;
  if (etag === undefined) throw new Error('Published catalog has no ETag');
  return { catalog, etag, ...(result.VersionId === undefined ? {} : { versionId: result.VersionId }) };
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    '$metadata' in error &&
    (error as { readonly $metadata?: { readonly httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
  );
}
