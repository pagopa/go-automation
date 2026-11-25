export interface InteropK8sApplicationLogAnalysis {
  readonly logCount: number;
  readonly cidCount: number;
  readonly cids: ReadonlyArray<string>;
  readonly logsWithoutCidCount: number;
  readonly representativeMessages: ReadonlyArray<string>;
}
