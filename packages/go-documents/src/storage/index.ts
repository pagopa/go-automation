/**
 * Storage namespace exports.
 */

export { GOFtsIndex } from './GOFtsIndex.js';
export type { GOFtsIndexConfig } from './GOFtsIndexConfig.js';
export type { GOFtsIndexDocument } from './GOFtsIndexDocument.js';
export { GOFtsIndexSearchMode } from './GOFtsIndexSearchMode.js';
export type { GOFtsIndexSearchModeValue } from './GOFtsIndexSearchMode.js';
export type { GOFtsIndexSearchOptions } from './GOFtsIndexSearchOptions.js';
export type { GOFtsIndexSearchResult } from './GOFtsIndexSearchResult.js';
export type { GOFtsIndexStats } from './GOFtsIndexStats.js';

// Re-export better-sqlite3 type aliases under stable names so consumer scripts
// can annotate variables that hold the result of `GOFtsIndex.getDatabase()`
// without taking a direct dependency on the `better-sqlite3` package.
export type { Database as GOSqliteDatabase, Statement as GOSqliteStatement } from 'better-sqlite3';
