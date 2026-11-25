import type { DocumentInspection } from './DocumentInspection.js';

/** Inspects one local document (see `LocalDocumentInspector`). */
export type DocumentInspectFn = (filePath: string) => Promise<DocumentInspection>;
