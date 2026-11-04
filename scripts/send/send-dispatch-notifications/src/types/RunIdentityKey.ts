/**
 * Settings of a run that a resume must repeat unchanged (saved in `run.json`
 * under `parameters.identity`):
 * - always: what determines the row keys and the requestIds;
 * - with `send`: what determines the content of the notifications;
 * - with `send` or `verify`: the target of the B2B calls.
 */
export type RunIdentityKey =
  | 'mode'
  | 'inputFormat'
  | 'mappingProfile'
  | 'mappingProfileSha256'
  | 'rowKeyColumn'
  | 'directRequestIdTemplate'
  | 'env'
  | 'endpoint'
  | 'cliValues'
  | 'environmentValues'
  | 'sharedDocument'
  | 'documentsDir'
  | 'attachmentsFile';
