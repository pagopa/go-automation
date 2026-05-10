/**
 * Text extraction namespace exports.
 */

export { GOTextExtractorRegistry } from './GOTextExtractorRegistry.js';
export type { GOTextExtractor } from './GOTextExtractor.js';
export type { GOTextExtractionOptions } from './GOTextExtractionOptions.js';
export type { GOTextExtractionResult } from './GOTextExtractionResult.js';
export { GOTextExtractionError } from './GOTextExtractionError.js';

export { GOPlainTextExtractor } from './extractors/GOPlainTextExtractor.js';
export { GOPdfTextExtractor } from './extractors/GOPdfTextExtractor.js';
export { GODocxTextExtractor } from './extractors/GODocxTextExtractor.js';
export { GOXlsxTextExtractor } from './extractors/GOXlsxTextExtractor.js';
export { GOEmailTextExtractor } from './extractors/GOEmailTextExtractor.js';
export { GOZipTextExtractor, ZIP_DEPTH_SYMBOL } from './extractors/GOZipTextExtractor.js';
export type { GOZipTextExtractorConfig } from './extractors/GOZipTextExtractor.js';
