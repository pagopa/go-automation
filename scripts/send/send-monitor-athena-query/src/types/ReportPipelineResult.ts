import type { AWSAthenaQueryResult } from '@pagopa/go-aws/athena';
import type { GOThresholdEvaluation } from '@pagopa/go-common/analysis';

import type { ReportArtifact } from './ReportArtifact.js';

export interface ReportPipelineResult {
  readonly athenaResult: AWSAthenaQueryResult;
  readonly artifact: ReportArtifact;
  readonly evaluation: GOThresholdEvaluation;
  readonly slackSent: boolean;
}
