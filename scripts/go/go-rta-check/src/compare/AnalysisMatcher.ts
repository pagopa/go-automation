import type { RunbookOutput } from '@go-automation/go-runbook';

import type { AlarmAnalysisDto } from '../types/WatchtowerDtos.js';
import type { AnalysisMatch, RunbookCheck } from '../types/RtaCheckReport.js';
import type { MatchAnalysisOptions } from './matchAnalysis.js';

/** Async V2 matcher used by per-occurrence orchestration. */
export type AnalysisMatcherFn = (
  output: RunbookOutput,
  check: RunbookCheck,
  analysis: AlarmAnalysisDto | undefined,
  firedAt: string,
  options: MatchAnalysisOptions,
) => Promise<AnalysisMatch>;
