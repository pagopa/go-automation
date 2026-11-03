import * as path from 'node:path';

import { DispatchError } from '../DispatchError.js';
import type { SharedDocumentConfig } from '../environment/SharedDocumentConfig.js';
import type { DocumentRef } from '../model/DocumentRef.js';
import type { DocumentSource } from '../model/DocumentSource.js';
import type { LocalDocument } from '../model/LocalDocument.js';
import type { DocumentResolverOptions } from './DocumentResolverOptions.js';
import type { DocumentToUpload } from './DocumentToUpload.js';
import { isInspectionFailure } from './isInspectionFailure.js';
import type { LocalDocumentInspector } from './LocalDocumentInspector.js';
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
   * @param config - Shared document of the CLI or of the environment
   * @param inspector - Local document inspector
   * @param uploadStage - Upload stage; absent in a dry run (placeholder keys)
   * @returns The references, in `docIdx` order
   * @throws DispatchError `SHARED_DOCUMENT_INVALID` when a file cannot be sent
   */
  public static async prepareShared(
    config: SharedDocumentConfig,
    inspector: LocalDocumentInspector,
    uploadStage: UploadStage | undefined,
  ): Promise<ReadonlyArray<DocumentRef>> {
    if (config.reference !== undefined) {
      const { key, versionToken, sha256 } = config.reference;
      const title = config.reference.title ?? config.title ?? 'Documento';
      return [{ key, versionToken, sha256, contentType: 'application/pdf', title }];
    }
    const files: ReadonlyArray<LocalDocument> = (config.files ?? []).map((file) => ({
      path: file,
      title: config.title ?? path.basename(file, path.extname(file)),
    }));
    const documents = await inspectAll(files, inspector, 'SHARED_DOCUMENT_INVALID');
    return uploadOrPlaceholder(documents, uploadStage);
  }

  /**
   * Resolves the documents of a row.
   *
   * @param source - Document source of the record
   * @returns References in `docIdx` order
   * @throws UploadError when a row file cannot be uploaded
   */
  public async resolve(source: DocumentSource): Promise<ReadonlyArray<DocumentRef>> {
    switch (source.kind) {
      case 'shared':
        return this.options.shared ?? [];
      case 'reference':
        return source.refs;
      case 'pratica':
        return (this.options.attachmentsByPratica?.get(source.pratica) ?? []).map((attachment) => ({
          key: attachment.fileKey,
          versionToken: attachment.versionToken,
          sha256: attachment.sha256,
          contentType: attachment.contentType,
          title: path.basename(attachment.filePath, path.extname(attachment.filePath)),
        }));
      case 'rowFiles': {
        const documents = await inspectAll(source.files, this.options.inspector, 'DOCUMENT_INVALID');
        return uploadOrPlaceholder(documents, this.options.uploadStage);
      }
      default: {
        const exhaustive: never = source;
        throw new Error(`Unhandled document source ${JSON.stringify(exhaustive)}`);
      }
    }
  }
}

async function inspectAll(
  files: ReadonlyArray<LocalDocument>,
  inspector: LocalDocumentInspector,
  code: string,
): Promise<ReadonlyArray<DocumentToUpload>> {
  const documents: DocumentToUpload[] = [];
  for (const file of files) {
    const inspection = await inspector.inspect(file.path);
    if (isInspectionFailure(inspection)) {
      throw new DispatchError(code, `${inspection.path}: ${inspection.message}`);
    }
    documents.push({ title: file.title, inspected: inspection });
  }
  return documents;
}

async function uploadOrPlaceholder(
  documents: ReadonlyArray<DocumentToUpload>,
  uploadStage: UploadStage | undefined,
): Promise<ReadonlyArray<DocumentRef>> {
  if (uploadStage !== undefined) return uploadStage.resolve(documents);
  return documents.map(({ title, inspected }) => ({
    key: `<upload:${inspected.sha256}>`,
    versionToken: '<upload>',
    sha256: inspected.sha256,
    contentType: inspected.contentType,
    title,
  }));
}
