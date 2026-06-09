import { Core } from '@go-automation/go-common';
import * as nodePath from 'node:path';

import type { RunbookOutput } from '@go-automation/go-runbook';

import type { CachedRunbookMeta } from './CachedRunbookMeta.js';
import type { CachedRunbookOutput } from './CachedRunbookOutput.js';

/**
 * Resume cache for per-occurrence runbook outputs, so re-runs skip CloudWatch.
 * Each entry is an envelope (`output` + `fingerprint` + `meta`) and is reused
 * only when its fingerprint still matches the current runbook/inputs, so a stale
 * result is never returned after a runbook or schema change. Paths are resolved
 * through the GOScript path system (CACHE type) at
 * `cache/runbook/<alarmName>/<eventId>.json`.
 */
function cacheRelPath(alarmName: string, eventId: string): string {
  const safe = alarmName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return nodePath.join('runbook', safe, `${eventId}.json`);
}

/**
 * Returns the cached output for an occurrence, or `undefined` when absent **or
 * stale** (fingerprint mismatch — including legacy entries with no fingerprint).
 *
 * @param script - GOScript (resolves the cache path)
 * @param alarmName - Alarm name (= runbook id)
 * @param eventId - Occurrence id
 * @param expectedFingerprint - Fingerprint the entry must match to be reused
 */
export async function loadCachedOutput(
  script: Core.GOScript,
  alarmName: string,
  eventId: string,
  expectedFingerprint: string,
): Promise<RunbookOutput | undefined> {
  const importer = new Core.GOJSONFileImporter<CachedRunbookOutput>({
    inputPath: script.paths.resolvePath(cacheRelPath(alarmName, eventId), Core.GOPathType.CACHE),
    optional: true,
  });
  const cached = await importer.import();
  if (cached === undefined) {
    return undefined;
  }
  // Stale guard: a fingerprint mismatch (or a legacy entry without one) is a miss.
  if (cached.fingerprint !== expectedFingerprint) {
    return undefined;
  }
  return cached.output;
}

/**
 * Persists the output for an occurrence into the resume cache as an envelope.
 *
 * @param script - GOScript (resolves the cache path)
 * @param alarmName - Alarm name (= runbook id)
 * @param eventId - Occurrence id
 * @param output - The runbook output to cache
 * @param meta - The fingerprint inputs (stored for transparency)
 * @param fingerprint - The fingerprint gating reuse on load
 */
export async function saveCachedOutput(
  script: Core.GOScript,
  alarmName: string,
  eventId: string,
  output: RunbookOutput,
  meta: CachedRunbookMeta,
  fingerprint: string,
): Promise<void> {
  const envelope: CachedRunbookOutput = {
    fingerprint,
    savedAt: new Date().toISOString(),
    meta,
    output,
  };
  const exporter = new Core.GOJSONFileExporter({
    outputPath: script.paths.resolvePath(cacheRelPath(alarmName, eventId), Core.GOPathType.CACHE),
    pretty: true,
    indent: 2,
  });
  await exporter.export(envelope);
}
