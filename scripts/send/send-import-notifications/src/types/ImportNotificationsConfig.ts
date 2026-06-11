/**
 * Script configuration interface
 * Represents all validated configuration parameters for send-import-notifications
 */
export interface ImportNotificationsConfig {
  /** Path del file CSV di input */
  readonly csvFile: string;

  /** Path del file CSV di export (con IUN) */
  readonly exportFile: string;

  /** Path del file files-results.json di send-upload-attachments (allegati multipli per pratica) */
  readonly attachmentsFile?: string;

  /** Base URL del servizio PN */
  readonly basePath: string;

  /** API Key per autenticazione PN */
  readonly pnApiKey: string;

  /** Invia realmente le notifiche (false = dry-run) */
  readonly sendNotifications: boolean;

  /** Numero di notifiche da processare in parallelo */
  readonly concurrency: number;

  /** Effettua polling per ottenere IUN */
  readonly pollForIun: boolean;

  /** Tentativi massimi di polling per IUN */
  readonly pollMaxAttempts: number;

  /** Delay in ms tra tentativi di polling */
  readonly pollDelayMs: number;

  /** Soglia MB per attivare streaming mode */
  readonly streamingThresholdMb: number;

  /** Preserva tutte le colonne originali del CSV nell'export */
  readonly preserveAllColumns: boolean;

  /** Esporta tutte le righe, incluse quelle fallite */
  readonly exportAllRows: boolean;

  /** Includi colonne di stato nell'export */
  readonly includeStatusColumns: boolean;

  /** URL del proxy HTTP per debugging */
  readonly proxyUrl?: string;
}
