import { Core } from '@go-automation/go-common';

import type { WatchtowerApplyMode } from '../types/WatchtowerApplyMode.js';

export function resolveApplyMode(value: string | undefined): WatchtowerApplyMode {
  const normalized = value?.trim().toLowerCase() ?? 'none';
  if (normalized === '' || normalized === 'none') return 'SHADOW';
  if (normalized === 'known') return 'APPLY_KNOWN';
  // `all` è chiuso a ogni ingresso in v1 (§4.5): Watchtower rifiuta il modo, e
  // un errore qui dice perché invece di far scoprire un 400 a valle.
  if (normalized === 'all') {
    throw new Error(
      `${Core.GOConfigKeyTransformer.toCLIFlag('apply')}=all is not available: APPLY_ALL is disabled in v1; use "known".`,
    );
  }
  throw new Error(`${Core.GOConfigKeyTransformer.toCLIFlag('apply')} must be one of: none, known`);
}
