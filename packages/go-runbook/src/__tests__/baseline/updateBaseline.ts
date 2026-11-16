/**
 * Rewrites the versioned baseline of the go-runbook reorganization
 * (EVO-RBREORG-OPUS-01 §9.1). Run with `pnpm --filter @pagopa/go-runbook baseline:update`.
 *
 * In the move phases (F1–F4) the baseline must not change: run this only in
 * F0, or in F5–F6 when a change is intended and explained in the commit.
 */
import { GOJSONFileExporter } from '@pagopa/go-common/exporters';

import {
  BASELINE_DIR,
  collectCanonicalRunbooks,
  collectDescriptors,
  collectFingerprints,
  collectSurface,
} from './collectBaseline.js';

const files: ReadonlyArray<readonly [string, unknown]> = [
  ['descriptors.json', collectDescriptors()],
  ['canonical.json', collectCanonicalRunbooks()],
  ['fingerprints.json', collectFingerprints()],
  ['surface.json', collectSurface()],
];

for (const [name, data] of files) {
  await new GOJSONFileExporter({ outputPath: `${BASELINE_DIR}${name}`, pretty: true, indent: 2 }).export(data);
  process.stdout.write(`baseline: wrote ${name}\n`);
}
