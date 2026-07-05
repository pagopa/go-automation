import type { AutomaticRunbookCatalogV1, AutomaticRunbookDescriptorV1 } from './external.js';
import { buildAutomaticRunbookCatalog, canonicalizeJson } from './external.js';

type CatalogDiffKind = 'UNCHANGED' | 'COMPATIBLE' | 'INCOMPATIBLE';

export interface CatalogDiff {
  readonly kind: CatalogDiffKind;
  readonly added: ReadonlyArray<string>;
  readonly changed: ReadonlyArray<string>;
  readonly removed: ReadonlyArray<string>;
  /** Removed or incompatibly changed keys that require withdraw and drain before the worker swap. */
  readonly incompatible: ReadonlyArray<string>;
}

export function buildCatalog(input: {
  readonly environment: string;
  readonly artifactRevision: string;
  readonly actorArn: string;
  readonly changeNote: string;
  readonly publishedAt?: string;
  readonly runbooks: ReadonlyArray<AutomaticRunbookDescriptorV1>;
}): AutomaticRunbookCatalogV1 {
  return buildAutomaticRunbookCatalog({
    schemaVersion: 1,
    environment: input.environment,
    worker: { artifactRevision: input.artifactRevision, commandSchemaVersion: '1.0.0' },
    runbooks: input.runbooks,
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    release: { actorArn: input.actorArn, changeNote: input.changeNote },
  });
}

/** Serialized form shared by the published S3 object and the local catalog/artifact files. */
export function serializeCatalog(catalog: AutomaticRunbookCatalogV1): string {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

export function diffCatalog(
  current: AutomaticRunbookCatalogV1 | undefined,
  next: AutomaticRunbookCatalogV1,
): CatalogDiff {
  if (current === undefined) {
    return { kind: 'COMPATIBLE', added: keys(next), changed: [], removed: [], incompatible: [] };
  }
  const previous = new Map(current.runbooks.map((entry) => [entry.key, entry]));
  const incoming = new Map(next.runbooks.map((entry) => [entry.key, entry]));
  const added = keys(next).filter((key) => !previous.has(key));
  const removed = keys(current).filter((key) => !incoming.has(key));
  const changed = keys(next).filter((key) => {
    const before = previous.get(key);
    const after = incoming.get(key);
    return before !== undefined && after !== undefined && canonicalizeJson(before) !== canonicalizeJson(after);
  });
  const incompatibleChanged = changed.filter((key) => {
    const before = previous.get(key)!; // Safe: changed only contains keys present in both catalogs
    const after = incoming.get(key)!; // Safe: changed only contains keys present in both catalogs
    return (
      before.version !== after.version ||
      before.definitionDigest !== after.definitionDigest ||
      canonicalizeJson(before.alarmNames) !== canonicalizeJson(after.alarmNames)
    );
  });
  const incompatible = [...removed, ...incompatibleChanged].sort();
  return {
    kind: current.revision === next.revision ? 'UNCHANGED' : incompatible.length > 0 ? 'INCOMPATIBLE' : 'COMPATIBLE',
    added,
    changed,
    removed,
    incompatible,
  };
}

function keys(catalog: AutomaticRunbookCatalogV1): string[] {
  return catalog.runbooks.map(({ key }) => key).sort();
}
