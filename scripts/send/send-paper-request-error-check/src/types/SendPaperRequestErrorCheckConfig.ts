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
 export type ExecutionMode =
   | 'all'
   | 'check-feedback'
   | 'get-attachments'
   | 'retrieve-attachments'
   | 'retrieve-glacier'
   | 'validate-pdf'
   | 'fetch-timelines';

 /**
  * Configurazione per il ripristino S3 Glacier
  */
 export interface GlacierRestoreConfig {
   readonly expirationDays: number;
   readonly tier: 'Bulk' | 'Standard' | 'Expedited';
 }

 /**
  * Configurazione per la validazione PDF S3
  */
 export interface PdfValidationConfig {
   readonly concurrency: number;
   readonly batchSize: number;
   readonly dryRun: boolean;
 }

 /**
  * Struttura delle metriche di report finale per l'elaborazione
  */
 export interface PaperRequestMetrics {
   readonly totalInitialRequestIds: number;
   readonly canceledCount: number;
   readonly perfectedCount: number;
   readonly invalidAttachmentsCount: number;
   readonly toResubmitCount: number;
   readonly toVerifyManuallyCount: number;
   readonly glacierRestoredCount: number;
 }

/**
 * Risultati dell'elaborazione per la verifica dei feedback da requestId
 */
export interface CheckFeedbackResult {
  readonly totalChecked: number;
  readonly foundCount: number;
  readonly notFoundCount: number;
  readonly foundRequestIds: ReadonlyArray<{ requestId: string; event: Record<string, unknown> }>;
  readonly notFoundRequestIds: ReadonlyArray<string>;
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
  readonly attachmentsExtractedCount: number;
  readonly aarsExtractedCount: number;
  readonly errorsCount: number;
}

 /**
  * Interfaccia di configurazione principale dello script Send Paper Request Error Check
  */
 export interface SendPaperRequestErrorCheckConfig {
   /** Nome del profilo AWS SSO per autenticazione */
   readonly awsProfile?: string;

   /** Ambiente AWS di destinazione (dev, uat, test, prod, hotfix) */
   readonly envName?: string;

   /** Modalità di esecuzione (all o singolo modulo) */
   readonly mode: ExecutionMode;

   /** File di input contenente i requestId o IUN */
   readonly inputFile?: string;

   /** Nome del bucket S3 di destinazione */
   readonly bucket?: string;

   /** Abilita la modalità di ripristino/restore allegati */
   readonly restore: boolean;

   /** Directory di output per risultati e report */
   readonly outputDir: string;

   /** Configurazione specifica per il restore da Glacier */
   readonly glacier: GlacierRestoreConfig;

   /** Configurazione specifica per la validazione PDF */
   readonly pdfValidation: PdfValidationConfig;
 }
