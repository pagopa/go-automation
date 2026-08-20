import { Core } from '@go-automation/go-common';
import * as nodePath from 'node:path';

import type { CachedRunbookOutput, RunbookCheckCache } from '@go-automation/go-watchtower-runbook';

/**
 * Filesystem adapter of the resume cache port, so re-runs skip CloudWatch.
 *
 * Each entry is an envelope (`output` + `fingerprint` + `meta`); the staleness
 * policy lives in the library, this adapter only stores and retrieves. Paths are
 * resolved through the GOScript path system (CACHE type) at
 * `cache/runbook/<alarmName>/<eventId>.json`.
 */
export class GOScriptRunbookCheckCache implements RunbookCheckCache {
  constructor(private readonly script: Core.GOScript) {}

  async get(key: string): Promise<CachedRunbookOutput | undefined> {
    const importer = new Core.GOJSONFileImporter<CachedRunbookOutput>({
      inputPath: this.resolve(key),
      optional: true,
    });
    return await importer.import();
  }

  async set(key: string, value: CachedRunbookOutput): Promise<void> {
    const exporter = new Core.GOJSONFileExporter({
      outputPath: this.resolve(key),
      pretty: true,
      indent: 2,
    });
    await exporter.export(value);
  }

  /** Maps an `<alarmName>/<eventId>` cache key onto the on-disk layout, sanitizing every segment. */
  private resolve(key: string): string {
    const separator = key.lastIndexOf('/');
    const alarmName = separator === -1 ? key : key.slice(0, separator);
    const eventId = separator === -1 ? key : key.slice(separator + 1);
    return this.script.paths.resolvePath(
      nodePath.join('runbook', sanitizeSegment(alarmName), `${sanitizeSegment(eventId)}.json`),
      Core.GOPathType.CACHE,
    );
  }
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}
