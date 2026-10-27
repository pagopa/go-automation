/**
 * Modalità di esecuzione dello script:
 * - `all`: esegue la pipeline completa di controllo ed elaborazione
 * - `check-feedback`: verifica eventi SEND_ANALOG_FEEDBACK da requestId
 * - `get-attachments`: verifica e ripristino allegati notifiche
 * - `retrieve-attachments`: recupera allegati e AAR da IUN
 * - `retrieve-glacier`: effettua il restore da S3 Glacier
 * - `validate-pdf`: convalida i magic bytes dei PDF su S3
 * - `fetch-timelines`: scarica le timeline da DynamoDB per IUN
 */
type ExecutionMode =
  | 'all'
  | 'check-feedback'
  | 'get-attachments'
  | 'retrieve-attachments'
  | 'retrieve-glacier'
  | 'validate-pdf'
  | 'fetch-timelines';

/**
 * Struttura delle metriche di report finale per l'elaborazione
 */
export interface PaperRequestMetrics {
  totalInitialRequestIds: number;
  canceledCount: number;
  perfectedCount: number;
  viewedCount: number;
  refinedCount: number;
  invalidAttachmentsCount: number;
  toResubmitCount: number;
  withFeedback: number;
  withoutFeedback: number;
  failedFeedbackCount?: number | undefined;
  glacierRestoredCount: number;
  attachmentsFoundCount?: number | undefined;
  validPdfCount?: number | undefined;
  invalidPdfCount?: number | undefined;
  timelinesFetchedCount?: number | undefined;
  glacierEligibleAarCount?: number | undefined;
  pdfEligibleAttachmentsCount?: number | undefined;
  skippedAttachmentsDeleteMarkerCount?: number | undefined;
  skippedAarActiveTierCount?: number | undefined;
  errorsCount?: number | undefined;
}

/**
 * Risultati dell'elaborazione per la verifica dei feedback da requestId
 */
export interface CheckFeedbackResult {
  readonly totalChecked: number;
  readonly foundCount: number;
  readonly notFoundCount: number;
  readonly failedCount: number;
  readonly foundRequestIds: ReadonlyArray<{ requestId: string; event: Record<string, unknown> }>;
  readonly notFoundRequestIds: ReadonlyArray<string>;
  readonly failedRequestIds: ReadonlyArray<string>;
}

/**
 * Risultati dell'elaborazione per la verifica e ripristino degli allegati notifica per IUN
 */
export interface GetNotificationAttachmentsResult {
  readonly totalProcessed: number;
  readonly notificationsFound: number;
  readonly notificationsNotFound: number;
  readonly attachmentsFound: number;
  readonly attachmentsNotFound: number;
  readonly deleteMarkersFound: number;
  readonly dynamoUpdateErrors: number;
}

/**
 * Risultati dell'elaborazione per il recupero degli allegati e AAR da IUN
 */
export interface RetrieveAttachmentsResult {
  readonly totalIuns: number;
  readonly attachmentsExtractedCount?: number;
  readonly aarsExtractedCount?: number;
  readonly errorsCount: number;
  readonly extractedKeys?: ReadonlyArray<string> | undefined;
  readonly attachmentKeys?: ReadonlyArray<string> | undefined;
  readonly aarKeys?: ReadonlyArray<string> | undefined;
  readonly glacierEligibleAarKeys?: ReadonlyArray<string> | undefined;
  readonly validPdfAttachmentKeys?: ReadonlyArray<string> | undefined;
  readonly skippedAttachmentsDeleteMarkerCount?: number | undefined;
  readonly skippedAarActiveTierCount?: number | undefined;
}

/**
 * Risultati dell'elaborazione per il ripristino da S3 Glacier
 */
export interface RetrieveGlacierResult {
  readonly totalItems: number;
  readonly skippedByUser: boolean;
  readonly restoredCount: number;
  readonly alreadyInProgressCount: number;
  readonly alreadyAvailableCount: number;
  readonly errorsCount: number;
}

/**
 * Risultati dell'elaborazione per la validazione dei magic bytes dei PDF su S3
 */
export interface PdfValidationResult {
  readonly totalChecked: number;
  readonly validPdfCount: number;
  readonly invalidPdfCount: number;
  readonly errorCount: number;
}

/**
 * Interfaccia di configurazione principale dello script Send Paper Request Error Check
 */
export interface SendPaperRequestErrorCheckConfig {
  /** Ambiente AWS di destinazione (dev, uat, test, prod, hotfix) */
  envName?: string;

  /** Modalità di esecuzione (all o singolo modulo) */
  readonly mode: ExecutionMode;

  /** File di input contenente i requestId o IUN */
  readonly inputFile?: string;

  /** Nome del bucket S3 di destinazione */
  readonly bucket?: string;

  /** Forza l'esecuzione senza richiedere conferme interattive */
  readonly force?: boolean;

  /** Directory di output per risultati e report */
  readonly outputDir: string;

  readonly glacierExpirationDays?: number;

  readonly glacierTier?: 'Bulk' | 'Standard' | 'Expedited';

  /** Configurazione specifica per la validazione PDF */
  readonly pdfValidationConcurrency?: number;

  /** Nome del profilo AWS SSO per autenticazione account Core*/
  awsProfileCore?: string;

  /** Nome del profilo AWS SSO per autenticazione account Core*/
  awsProfileConfinfo?: string;
}
