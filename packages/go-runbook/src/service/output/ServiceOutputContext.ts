export interface ServiceLogLine {
  readonly timestamp: string;
  readonly message: string;
}

export interface ServiceOutputContext {
  readonly alarm: {
    readonly name?: string;
    readonly datetime?: string;
    readonly datetimeEnd?: string;
    readonly timeRange: {
      readonly start?: string;
      readonly end?: string;
    };
  };
  readonly service: {
    readonly name: string;
    readonly logGroup: string;
    readonly errorCount?: number;
    readonly traceId?: string;
    readonly fallbackUuid?: string;
    readonly errorMessage?: string;
    readonly traceLogCount?: number;
    readonly recentLogs: ReadonlyArray<ServiceLogLine>;
    readonly traceLogs: ReadonlyArray<ServiceLogLine>;
  };
}
