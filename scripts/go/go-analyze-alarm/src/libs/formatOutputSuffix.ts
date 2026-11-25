const RESERVED_FILE_NAME_CHARS = /[<>:"/\\|?*]/gu;

/**
 * Builds the optional file-name suffix appended to trace/result outputs.
 * Characters reserved on common filesystems (Windows: `<>:"/\|?*`) are
 * replaced with `-` so range-mode ISO timestamps produce portable names.
 *
 * @param outputSuffix - Raw suffix (e.g. the occurrence ISO timestamp)
 * @returns `-<sanitized suffix>`, or an empty string when there is no suffix
 */
export function formatOutputSuffix(outputSuffix: string | undefined): string {
  const normalized = outputSuffix?.trim();
  if (normalized === undefined || normalized === '') return '';
  return `-${normalized.replace(RESERVED_FILE_NAME_CHARS, '-')}`;
}
