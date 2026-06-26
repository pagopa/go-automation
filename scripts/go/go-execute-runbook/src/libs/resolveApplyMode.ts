import { Core } from '@go-automation/go-common';

import type { WatchtowerApplyMode } from '../types/WatchtowerApplyMode.js';

export function resolveApplyMode(value: string | undefined): WatchtowerApplyMode {
  const normalized = value?.trim().toLowerCase() ?? 'none';
  if (normalized === '' || normalized === 'none') return 'SHADOW';
  if (normalized === 'known') return 'APPLY_KNOWN';
  if (normalized === 'all') return 'APPLY_ALL';
  throw new Error(`${Core.GOConfigKeyTransformer.toCLIFlag('apply')} must be one of: none, known, all`);
}
