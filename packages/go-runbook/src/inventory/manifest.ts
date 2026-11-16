/**
 * Every automatic runbook of the inventory: the union of the product manifests.
 *
 * The registry built from it (`./registry/`) checks key and alarm-name
 * collisions on the whole set, so a duplicate across products still fails.
 */
import type { RunbookRegistration } from '../toolkits/common/registration/RunbookRegistration.js';

import { INTEROP_MANIFEST } from './interop/manifest.js';
import { SEND_MANIFEST } from './send/manifest.js';

export const INVENTORY_MANIFEST: ReadonlyArray<RunbookRegistration> = [...SEND_MANIFEST, ...INTEROP_MANIFEST];
