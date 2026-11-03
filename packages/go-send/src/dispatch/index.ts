/**
 * Dispatch module: unified sending of SEND notifications
 * (EVO-SENDNOTIF-OPUS-01). Exported as the `Dispatch` namespace:
 *
 * ```typescript
 * import { Dispatch } from '@go-automation/go-send';
 * const session = await Dispatch.DispatchSession.open(options);
 * ```
 */

// Errors
export { DispatchError } from './DispatchError.js';

// Model
export type { DispatchMode } from './model/DispatchMode.js';
export type { DispatchPhase } from './model/DispatchPhase.js';
export type { DispatchRecord } from './model/DispatchRecord.js';
export type { DispatchSender } from './model/DispatchSender.js';
export type { DispatchRecipient } from './model/DispatchRecipient.js';
export type { DispatchPhysicalAddress } from './model/DispatchPhysicalAddress.js';
export type { DispatchDigitalDomicile } from './model/DispatchDigitalDomicile.js';
export type { DispatchPayment } from './model/DispatchPayment.js';
export type { DispatchNotificationOptions } from './model/DispatchNotificationOptions.js';
export type { DispatchGroup } from './model/DispatchGroup.js';
export type { DispatchClock } from './model/DispatchClock.js';
export { SystemClock } from './model/SystemClock.js';
export type { DocumentRef } from './model/DocumentRef.js';
export type { DocumentSource } from './model/DocumentSource.js';
export type { DocumentSourceKind } from './model/DocumentSourceKind.js';
export type { LocalDocument } from './model/LocalDocument.js';
export type { RowError } from './model/RowError.js';
export type { RowState } from './model/RowState.js';
export type { RowStatus } from './model/RowStatus.js';

// Environments
export type { Environment } from './environment/Environment.js';
export type { EnvironmentDefinition } from './environment/EnvironmentDefinition.js';
export type { EnvironmentsFile } from './environment/EnvironmentsFile.js';
export type { EnvironmentVariableLookupFn } from './environment/EnvironmentVariableLookupFn.js';
export type { SharedDocumentConfig } from './environment/SharedDocumentConfig.js';
export type { SharedDocumentReference } from './environment/SharedDocumentReference.js';
export type { PreflightInput } from './environment/PreflightInput.js';
export type { PreflightReport } from './environment/PreflightReport.js';
export { EnvironmentLoader } from './environment/EnvironmentLoader.js';
export { parseEnvironmentsFile, parseSharedDocument, normalizeBasePath } from './environment/parseEnvironmentsFile.js';
export {
  runEnvironmentPreflight,
  assertProductionCoherence,
  DEFAULT_PRODUCTION_HOSTS,
} from './environment/runEnvironmentPreflight.js';
export { apiKeyFingerprint } from './environment/apiKeyFingerprint.js';
export { processEnvironmentLookup } from './environment/processEnvironmentLookup.js';

// Mapping
export type { CanonicalField } from './mapping/CanonicalField.js';
export type { FieldValues } from './mapping/FieldValues.js';
export type { MappingProfile } from './mapping/MappingProfile.js';
export type { MappingOutputColumns } from './mapping/MappingOutputColumns.js';
export type { ValidationIssue } from './mapping/ValidationIssue.js';
export { CANONICAL_FIELDS, isCanonicalField } from './mapping/canonicalFields.js';
export { BUILT_IN_PROFILES } from './mapping/builtInProfiles.js';
export { parseMappingProfile } from './mapping/parseMappingProfile.js';
export { mapRow, mergeFieldValues } from './mapping/mapRow.js';
export { buildRecord } from './mapping/buildRecord.js';
export { RecordFactory } from './mapping/RecordFactory.js';
export { environmentFieldValues } from './mapping/environmentFieldValues.js';

// Identifiers
export { createRunId, decodeIun, deriveRowIdentifiers, resolveRowKey } from './ids/identifiers.js';

// Input
export type { InputFormat } from './input/InputFormat.js';
export { InputReader } from './input/InputReader.js';

// Documents
export type { SafeStorageGateway } from './documents/SafeStorageGateway.js';
export { AttachmentServiceGateway } from './documents/AttachmentServiceGateway.js';
export { LocalDocumentInspector, MAX_DOCUMENT_BYTES } from './documents/LocalDocumentInspector.js';
export { UploadError } from './documents/UploadError.js';

// Channels
export type { B2BApi } from './channels/B2BApi.js';
export { B2BChannel } from './channels/B2BChannel.js';
export { buildNotificationRequest } from './channels/buildNotificationRequest.js';
export { classifySendFailure } from './channels/classifySendFailure.js';
export type { SendFailure } from './channels/SendFailure.js';

// Direct mode (pn-external-channels, §9)
export type { ExternalChannelsApi } from './direct/ExternalChannelsApi.js';
export type { PaperEngagementRequest } from './direct/PaperEngagementRequest.js';
export type { PaperEngagementAttachment } from './direct/PaperEngagementAttachment.js';
export { ExternalChannelsChannel } from './direct/ExternalChannelsChannel.js';
export { buildPaperEngagement } from './direct/buildPaperEngagement.js';
export { DirectSendStage } from './direct/DirectSendStage.js';
export { RequestIdTemplate, DEFAULT_DIRECT_REQUEST_ID_TEMPLATE } from './ids/RequestIdTemplate.js';
export type { DirectModeOptions } from './run/DirectModeOptions.js';
export type { DispatchDirectOptions } from './model/DispatchDirectOptions.js';

// Journal
export type { JournalEntry } from './journal/JournalEntry.js';
export type { TransitionHandler } from './journal/TransitionHandler.js';
export { Journal } from './journal/Journal.js';

// requestId (§8.3)
export type { RequestIdSelect } from './requestId/RequestIdSelect.js';
export type { RequestIdWait } from './requestId/RequestIdWait.js';
export type { RequestIdSelection } from './requestId/RequestIdSelection.js';
export type { RequestIdSelectionOptions } from './requestId/RequestIdSelectionOptions.js';
export type { TimelineSource } from './requestId/TimelineSource.js';
export type { CredentialErrorPredicate } from './requestId/CredentialErrorPredicate.js';
export { DEFAULT_REQUEST_ID_OPTIONS } from './requestId/defaultRequestIdOptions.js';
export { selectRequestIds } from './requestId/selectRequestIds.js';
export { DynamoTimelineSource } from './requestId/DynamoTimelineSource.js';
export { RequestIdStage } from './requestId/RequestIdStage.js';

// Run
export type { DispatchRequestIdOptions } from './run/DispatchRequestIdOptions.js';
export type { DispatchSessionOptions } from './run/DispatchSessionOptions.js';
export type { DispatchSessionTuning } from './run/DispatchSessionTuning.js';
export type { DispatchSessionOutput } from './run/DispatchSessionOutput.js';
export type { DispatchProgress } from './run/DispatchProgress.js';
export type { ValidationSummary } from './run/ValidationSummary.js';
export type { RunInfo } from './run/RunInfo.js';
export type { FailureGroup } from './run/FailureGroup.js';
export type { SendStatistics } from './run/SendStatistics.js';
export { DispatchSession } from './run/DispatchSession.js';
export type { DispatchRunFiles } from './run/DispatchRunFiles.js';
export { RUN_FILES, readRunInfo } from './run/runFiles.js';
