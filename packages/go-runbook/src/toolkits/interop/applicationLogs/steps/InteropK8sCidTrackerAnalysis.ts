export interface InteropK8sCidTrackerAnalysis {
  readonly cidCount: number;
  readonly logCount: number;
  readonly podApps: ReadonlyArray<string>;
  readonly messages: ReadonlyArray<string>;
}
