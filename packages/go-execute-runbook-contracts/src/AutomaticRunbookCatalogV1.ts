export const AUTOMATIC_RUNBOOK_CATALOG_SCHEMA_VERSION = 1 as const;
export const AUTOMATIC_RUNBOOK_COMMAND_SCHEMA_VERSION = '1.0.0' as const;
export const AUTOMATIC_RUNBOOK_CATALOG_KEY = 'automatic-runbooks/v1/current.json' as const;

export const AutomaticRunbookKinds = {
  APIGW: 'APIGW',
  LAMBDA: 'LAMBDA',
  SERVICE: 'SERVICE',
} as const;

export type AutomaticRunbookKind = (typeof AutomaticRunbookKinds)[keyof typeof AutomaticRunbookKinds];

export interface AutomaticRunbookDescriptorV1 {
  readonly key: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly team: string;
  readonly kind: AutomaticRunbookKind;
  readonly categories: ReadonlyArray<string>;
  readonly tags: ReadonlyArray<string>;
  readonly alarmNames: readonly [string, ...string[]];
  readonly definitionDigest: string;
}

export interface AutomaticRunbookCatalogWorkerV1 {
  readonly artifactRevision: string;
  readonly commandSchemaVersion: typeof AUTOMATIC_RUNBOOK_COMMAND_SCHEMA_VERSION;
}

export interface AutomaticRunbookCatalogReleaseV1 {
  readonly actorArn: string;
  readonly changeNote: string;
}

/** Stable content covered by the catalog revision. */
export interface AutomaticRunbookCatalogRevisionPayloadV1 {
  readonly schemaVersion: typeof AUTOMATIC_RUNBOOK_CATALOG_SCHEMA_VERSION;
  readonly environment: string;
  readonly worker: AutomaticRunbookCatalogWorkerV1;
  readonly runbooks: ReadonlyArray<AutomaticRunbookDescriptorV1>;
}

/** GA-owned global catalog of runbooks present in the deployed worker artifact. */
export interface AutomaticRunbookCatalogV1 extends AutomaticRunbookCatalogRevisionPayloadV1 {
  readonly revision: string;
  readonly publishedAt: string;
  readonly release: AutomaticRunbookCatalogReleaseV1;
}

export type BuildAutomaticRunbookCatalogInputV1 = AutomaticRunbookCatalogRevisionPayloadV1 &
  Pick<AutomaticRunbookCatalogV1, 'publishedAt' | 'release'>;
