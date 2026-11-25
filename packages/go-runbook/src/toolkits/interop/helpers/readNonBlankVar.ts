import { trimToUndefined } from '@pagopa/go-common/utils';

import type { RunbookContext } from '../../../engine/index.js';

/**
 * Value of a runbook variable, trimmed; `undefined` when it is missing or blank.
 *
 * @param context - Runbook context
 * @param key - Variable name
 * @returns The trimmed value, or `undefined`
 */
export function readNonBlankVar(context: RunbookContext, key: string): string | undefined {
  return trimToUndefined(context.vars.get(key));
}
