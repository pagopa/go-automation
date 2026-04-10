/**
 * Re-export field path utilities from go-common Core.
 *
 * @module
 */
import { Core } from '@go-automation/go-common';

export const parseFieldPath: (path: string) => ReadonlyArray<string> = Core.parseFieldPath;
export const navigateFieldPath: (source: unknown, path: string) => unknown = Core.navigateFieldPath;
