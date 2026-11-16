import type { GOScript } from '@go-automation/go-script';
import { GOFileListExporter } from '@pagopa/go-common/exporters';
import { GOPathType } from '@pagopa/go-common/files';

import type { InteropAnalyzeAlarmsConfig } from './types/index.js';
import { analyzeInteropAlarmOccurrence } from './libs/analyzeInteropAlarmOccurrence.js';
import { findInteropAlarmOccurrences } from './libs/findInteropAlarmOccurrences.js';

export async function main(script: GOScript): Promise<void> {
  const noCidPath = script.paths.resolvePath('no_cid.txt', GOPathType.OUTPUT);
  const cidPath = script.paths.resolvePath('cid.txt', GOPathType.OUTPUT);

  const noCidExporter = new GOFileListExporter({ outputPath: noCidPath });
  const cidExporter = new GOFileListExporter({ outputPath: cidPath });

  script.logger.section('Starting Interop Analyze Alarms');

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
