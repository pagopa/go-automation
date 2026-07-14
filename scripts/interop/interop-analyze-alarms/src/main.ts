import { Core } from '@go-automation/go-common';

import type { InteropAnalyzeAlarmsConfig } from './types/index.js';
import { analyzeInteropAlarmOccurrence } from './libs/analyzeInteropAlarmOccurrence.js';
import { findInteropAlarmOccurrences } from './libs/findInteropAlarmOccurrences.js';

export async function main(script: Core.GOScript): Promise<void> {
  const now = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFolder = script.paths.getExecutionOutputDir();

  const noCidExporter = new Core.GOFileListExporter({ outputPath: `${outputFolder}/${now}_no_cid.txt` });
  const cidExporter = new Core.GOFileListExporter({ outputPath: `${outputFolder}/${now}_cid.txt` });

  script.logger.section('Starting Interop Analyzer Alarms');

  const config = await script.getConfiguration<InteropAnalyzeAlarmsConfig>();
  const requestedAlarmName = config.alarmName?.trim();

  script.logger.info(
    requestedAlarmName === undefined || requestedAlarmName === ''
      ? 'Retrieving alarm history for all alarms'
      : `Retrieving alarm history for alarm ${requestedAlarmName}`,
  );

  const occurrences = await findInteropAlarmOccurrences(script, {
    startDate: config.startDate,
    endDate: config.endDate,
    ...(requestedAlarmName === undefined || requestedAlarmName === '' ? {} : { alarmName: requestedAlarmName }),
  });

  const noCidLogArray: string[] = [];
  const cidLogArray: string[] = [];

  for (const occurrence of occurrences) {
    await analyzeInteropAlarmOccurrence({
      script,
      occurrence,
      noCidLogArray,
      cidLogArray,
      ...(requestedAlarmName === undefined || requestedAlarmName === '' ? {} : { requestedAlarmName }),
    });
  }

  script.prompt.startSpinner('Writing logs without CID in output file...');
  await noCidExporter.export(noCidLogArray);
  script.prompt.stopSpinner();

  script.prompt.startSpinner('Writing CID tracker logs in output file...');
  await cidExporter.export(cidLogArray);
  script.prompt.stopSpinner();
}
