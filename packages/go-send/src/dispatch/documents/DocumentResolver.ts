import * as path from 'node:path';

import { DispatchError } from '../DispatchError.js';
import type { DocumentRef } from '../model/DocumentRef.js';
import type { DocumentSource } from '../model/DocumentSource.js';
import type { LocalDocument } from '../model/LocalDocument.js';
import type { DocumentResolverOptions } from './DocumentResolverOptions.js';
import type { DocumentInspectFn } from './DocumentInspectFn.js';
import type { DocumentToUpload } from './DocumentToUpload.js';
import { isInspectionFailure } from './isInspectionFailure.js';
import type { PrepareSharedOptions } from './PrepareSharedOptions.js';
import type { UploadStage } from './UploadStage.js';

/**
 * Turns the document source of a row into SafeStorage references (§8.1.1).
 */
export class DocumentResolver {
  constructor(private readonly options: DocumentResolverOptions) {}

  /**
   * Prepares the shared document of the run, once, before any send: files are
   * inspected and uploaded, a reference is used as is.
   *
   * @param options - Shared document, inspector, upload stage and dry-run placeholders
   * @returns The references, in `docIdx` order
   * @throws DispatchError `SHARED_DOCUMENT_INVALID` when a file cannot be sent,
   *   `CONFIGURATION` when a file must be uploaded and there is no upload stage
   */
  public static async prepareShared(options: PrepareSharedOptions): Promise<ReadonlyArray<DocumentRef>> {
    const { config, inspector, uploadStage, placeholders } = options;
    if (config.reference !== undefined) {
      const { key, versionToken, sha256 } = config.reference;
      const title = config.reference.title ?? config.title ?? 'Documento';
      return [{ key, versionToken, sha256, contentType: 'application/pdf', title }];
    }
    const files: ReadonlyArray<LocalDocument> = (config.files ?? []).map((file) => ({
      path: file,
      title: config.title ?? path.basename(file, path.extname(file)),
    }));
    const documents = await inspectAll(files, 'SHARED_DOCUMENT_INVALID', async (filePath) =>
      inspector.inspect(filePath),
    );
    return uploadOrPlaceholder(documents, uploadStage, placeholders);
  }

  /**
   * Resolves the documents of a row.
   *
   * @param source - Document source of the record
   * @returns References in `docIdx` order
   * @throws UploadError when a row file cannot be uploaded; DispatchError
   *   `CONFIGURATION` when it must be uploaded and there is no upload stage,
   *   `PRATICA_UNKNOWN` / `PRATICA_EMPTY` when the pratica has no uploaded
   *   attachments (not retryable: the upload output must be fixed),
   *   `DOCUMENT_INVALID` when a row file cannot be sent
   */
  public async resolve(source: DocumentSource): Promise<ReadonlyArray<DocumentRef>> {
    switch (source.kind) {
      case 'shared':
        return this.options.shared ?? [];
      case 'reference':
        return source.refs;
      case 'pratica': {
        const attachments = this.options.attachmentsByPratica?.get(source.pratica);
        if (attachments === undefined) {
          throw new DispatchError('PRATICA_UNKNOWN', `pratica ${source.pratica}: no uploaded attachments found`);
        }
        if (attachments.length === 0) {
          throw new DispatchError('PRATICA_EMPTY', `pratica ${source.pratica}: the upload output lists no attachment`);
        }
        return attachments.map((attachment) => ({
          key: attachment.fileKey,
          versionToken: attachment.versionToken,
          sha256: attachment.sha256,
          contentType: attachment.contentType,
          title: path.basename(attachment.filePath, path.extname(attachment.filePath)),
        }));
      }
      case 'rowFiles': {
        const { inspector } = this.options;
        const documents = await inspectAll(source.files, 'DOCUMENT_INVALID', async (filePath) =>
          inspector.inspectRowFile(filePath),
        );
        return uploadOrPlaceholder(documents, this.options.uploadStage, this.options.placeholders);
      }
      default: {
        const exhaustive: never = source;
        throw new Error(`Unhandled document source ${JSON.stringify(exhaustive)}`);
      }
    }
  }
}

/**
 * Inspects files in parallel (the inspector caches by path, so a file shared
 * by many rows is still read once).
 *
 * @param files - Files with their titles
 * @param code - Error code when a file cannot be sent
 * @param inspect - Inspection to use: confined for row files, plain for the shared document
 */
async function inspectAll(
  files: ReadonlyArray<LocalDocument>,
  code: string,
  inspect: DocumentInspectFn,
): Promise<ReadonlyArray<DocumentToUpload>> {
  const inspected = await Promise.all(
    files.map(async (file) => ({ title: file.title, inspection: await inspect(file.path) })),
  );
  return inspected.map(({ title, inspection }) => {
    if (isInspectionFailure(inspection)) {
      throw new DispatchError(code, `${inspection.path}: ${inspection.message}`);
    }
    return { title, inspected: inspection };
  });
}

async function uploadOrPlaceholder(
  documents: ReadonlyArray<DocumentToUpload>,
  uploadStage: UploadStage | undefined,
  placeholders: boolean,
): Promise<ReadonlyArray<DocumentRef>> {
  if (uploadStage !== undefined) return uploadStage.resolve(documents);
  if (!placeholders) {
    throw new DispatchError(
      'CONFIGURATION',
      'documents must be uploaded but the SafeStorage gateway is not configured',
    );
  }
  return documents.map(({ title, inspected }) => ({
    key: `<upload:${inspected.sha256}>`,
    versionToken: '<upload>',
    sha256: inspected.sha256,
    contentType: inspected.contentType,
    title,
  }));
}
