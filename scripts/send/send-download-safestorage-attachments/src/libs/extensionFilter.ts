/**
 * Extension-based filtering for download tasks.
 */

import type { AttachmentDownloadTask } from '../types/AttachmentDownloadTask.js';

/**
 * Parses the comma-separated extension string into a normalised Set.
 * Extensions are lowercased and stripped of any leading dot.
 *
 * @param raw - Raw string from config (e.g. "pdf,txt,.bin")
 * @returns Set of lowercase extensions without dots (e.g. {"pdf","txt","bin"})
 */
export function parseExtensions(raw: string): ReadonlySet<string> {
  const extensions = new Set<string>();
  for (const part of raw.split(',')) {
    const ext = part.trim().toLowerCase().replace(/^\./, '');
    if (ext.length > 0) {
      extensions.add(ext);
    }
  }
  return extensions;
}

/**
 * Filters download tasks by file extension.
 *
 * When `allowedExtensions` is empty the function returns the original array
 * unchanged (no filter configured).
 *
 * Complexity: O(N) where N is the number of tasks.
 *
 * @param tasks - All resolved download tasks
 * @param allowedExtensions - Set of lowercase extensions without dots
 * @returns Filtered subset of tasks whose file key extension is in the allowed set
 */
export function filterTasksByExtension(
  tasks: ReadonlyArray<AttachmentDownloadTask>,
  allowedExtensions: ReadonlySet<string>,
): ReadonlyArray<AttachmentDownloadTask> {
  if (allowedExtensions.size === 0) {
    return tasks;
  }

  return tasks.filter((task) => {
    const dotIndex = task.key.lastIndexOf('.');
    if (dotIndex === -1) {
      return false;
    }
    const ext = task.key.slice(dotIndex + 1).toLowerCase();
    return allowedExtensions.has(ext);
  });
}
