export interface ServiceLogAnalysis {
  readonly errorMessage: string;
  readonly logCount: number;
  readonly traceId: string | undefined;
  readonly traceIdRaw: string | undefined;
  readonly fallbackUuid: string | undefined;
}
