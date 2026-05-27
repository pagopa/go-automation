import type { AWS, Core } from '@go-automation/go-common';

import type { ReportArtifact } from './ReportArtifact.js';

export interface ReportPipelineResult {
  readonly athenaResult: AWS.AWSAthenaQueryResult;
  readonly artifact: ReportArtifact;
  readonly evaluation: Core.GOThresholdEvaluation;
  readonly slackSent: boolean;
}
