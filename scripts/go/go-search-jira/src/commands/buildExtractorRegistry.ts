/**
 * Builds the registry of supported text extractors for go-search-jira:
 * PDF, DOCX, XLSX, plain text (TXT/MD/CSV/JSON/NDJSON/XML/SVG), EML and ZIP.
 *
 * The ZIP extractor is wired with a back-reference to the registry so it can
 * recursively dispatch each archive entry through it.
 */
import { Core } from '@go-automation/go-common';

export function buildExtractorRegistry(): Core.GOTextExtractorRegistry {
  const registry = new Core.GOTextExtractorRegistry();
  registry.register(new Core.GOPlainTextExtractor());
  registry.register(new Core.GOPdfTextExtractor());
  registry.register(new Core.GODocxTextExtractor());
  registry.register(new Core.GOXlsxTextExtractor());
  registry.register(new Core.GOEmailTextExtractor());
  registry.register(new Core.GOZipTextExtractor({ registry }));
  return registry;
}
