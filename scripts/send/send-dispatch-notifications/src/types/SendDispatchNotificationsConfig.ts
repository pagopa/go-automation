/**
 * Typed configuration of the script (camelCase of the parameters in config.ts).
 */
export interface SendDispatchNotificationsConfig {
  readonly mode: string;
  readonly inputFile?: string | undefined;
  readonly inputFormat?: string | undefined;
  readonly mappingProfile: string;
  readonly rowKeyColumn?: string | undefined;

  readonly env?: string | undefined;
  readonly environmentsFile?: string | undefined;
  readonly listEnvs: boolean;
  readonly basePath?: string | undefined;
  readonly pnApiKey?: string | undefined;
  readonly groupId?: string | undefined;
  readonly senderTaxId?: string | undefined;
  readonly senderDenomination?: string | undefined;
  readonly apiVersion: string;
  readonly defaults?: ReadonlyArray<string> | undefined;
  readonly ecBaseUrl?: string | undefined;
  readonly ecClientId: string;
  readonly directRequestIdTemplate: string;

  readonly documentFile?: ReadonlyArray<string> | undefined;
  readonly documentTitle?: string | undefined;
  readonly documentsDir?: string | undefined;
  readonly attachmentsFile?: string | undefined;
  readonly uploadConcurrency: number;
  readonly preloadBatchSize: number;
  readonly uploadReuseMaxAge: string;

  readonly phases: ReadonlyArray<string>;
  readonly dryRun: boolean;
  readonly yes: boolean;
  readonly confirmProduction?: number | undefined;
  readonly failFast: boolean;
  readonly verbose: boolean;

  readonly resume?: string | undefined;
  readonly retryFailed: boolean;
  readonly retryUncertain: boolean;
  readonly sendRetryAmbiguous: boolean;
  readonly sendTimeout: string;

  readonly rate?: number | undefined;
  readonly burst: number;
  readonly rateAdaptive: boolean;
  readonly maxInFlight: number;
  readonly httpTimeout: string;
  readonly proxyUrl?: string | undefined;

  readonly verifyInitialDelay: string;
  readonly verifyTimeout: string;

  readonly awsProfiles?: ReadonlyArray<string> | undefined;
  readonly requestIdCategories: ReadonlyArray<string>;
  readonly requestIdSelect: string;
  readonly requestIdWait: string;
  readonly requestIdEndCategories?: ReadonlyArray<string> | undefined;
  readonly requestIdInitialDelay: string;
  readonly requestIdTimeout: string;
  readonly dynamodbConcurrency: number;

  readonly outputFormat?: string | undefined;
  readonly outputFile?: string | undefined;
  readonly outputIncludeStatus: boolean;
  readonly outputOnlySuccess: boolean;
}
