/**
 * Helpers to open and close the FTS index used by go-search-jira.
 * Centralises the metadata column declaration and tokenizer choice so they are
 * consistent between the writer (sync) and the reader (search/status).
 */
import * as path from 'node:path';
import { Core } from '@go-automation/go-common';

import { IndexSchemaManager } from './IndexSchemaManager.js';

const METADATA_COLUMNS: ReadonlyArray<string> = ['issue_key', 'project_key', 'filename', 'mime_type'];
const FTS_TABLE_NAME = 'attachments_fts';

export interface OpenIndexOptions {
  readonly dataDir: string;
  readonly indexFileName: string;
  readonly readonly?: boolean;
}

export async function openIndex(options: OpenIndexOptions): Promise<Core.GOFtsIndex> {
  const databasePath = path.isAbsolute(options.indexFileName)
    ? options.indexFileName
    : path.join(options.dataDir, options.indexFileName);

  const index = new Core.GOFtsIndex({
    databasePath,
    ftsTableName: FTS_TABLE_NAME,
    metadataColumns: METADATA_COLUMNS,
    readonly: options.readonly ?? false,
  });

  await index.open();

  if (options.readonly !== true) {
    new IndexSchemaManager(index).ensureSchema();
  }

  return index;
}

export async function closeIndex(index: Core.GOFtsIndex): Promise<void> {
  index.checkpoint();
  await index.close();
}
