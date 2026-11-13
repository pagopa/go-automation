/**
 * Builds the registry of supported text extractors for go-search-jira:
 * PDF, DOCX, XLSX, plain text (TXT/MD/CSV/JSON/NDJSON/XML/SVG), EML and ZIP.
 *
 * The ZIP extractor is wired with a back-reference to the registry so it can
 * recursively dispatch each archive entry through it.
 */
import {
  GODocxTextExtractor,
  GOEmailTextExtractor,
  GOPdfTextExtractor,
  GOPlainTextExtractor,
  GOTextExtractorRegistry,
  GOXlsxTextExtractor,
  GOZipTextExtractor,
} from '@go-automation/go-documents';

export function buildExtractorRegistry(): GOTextExtractorRegistry {
  const registry = new GOTextExtractorRegistry();
  registry.register(new GOPlainTextExtractor());
  registry.register(new GOPdfTextExtractor());
  registry.register(new GODocxTextExtractor());
  registry.register(new GOXlsxTextExtractor());
  registry.register(new GOEmailTextExtractor());
  registry.register(new GOZipTextExtractor({ registry }));
  return registry;
}
