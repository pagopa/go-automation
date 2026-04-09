import { Core } from '@go-automation/go-common';

import { GOAIHat } from '@go-automation/go-ai';

const HAT_DESCRIPTIONS: Record<GOAIHat, string> = {
  [GOAIHat.Normal]: 'test cases from requirement (JSON)',
  [GOAIHat.Gherkin]: 'BDD Gherkin scenarios',
  [GOAIHat.SRSAnalysis]: 'requirements, ambiguities, risks (JSON)',
  [GOAIHat.CodeReview]: 'bugs, security, best practices (JSON)',
  [GOAIHat.RunbookAssist]: 'runbook steps and improvements (JSON)',
  [GOAIHat.AlarmDiagnosis]: 'cause, severity, actions, classification (JSON)',
};

export function printHats(script: Core.GOScript): void {
  script.logger.section('Available hats');
  for (const [hat, desc] of Object.entries(HAT_DESCRIPTIONS)) {
    script.logger.text(`  ${hat.padEnd(20)} ${desc}`);
  }
}
