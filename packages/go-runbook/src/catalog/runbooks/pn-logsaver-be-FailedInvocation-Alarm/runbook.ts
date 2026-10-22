import { RunbookBuilder } from '../../../builders/RunbookBuilder.js';
import { unknownCaseFallback } from '../../../actions/unknownCaseFallback.js';
import { knownCase } from '../framework.js';
import type { Runbook } from '../framework.js';
import { all } from '../common/conditions.js';
import { varEquals } from '../common/varConditions.js';
import { LOGSAVER_ALARM, RUNBOOK_URL } from './alarmDefinition.js';
import { LOG_GROUP, QueryLogsaverDiagnosticsStep } from './QueryLogsaverDiagnosticsStep.js';

const DIAGNOSTIC_DETAILS = [
  ['Account verificati', '{{vars.logsaverAccountsChecked}}'],
  ['Log di errore', '{{vars.logsaverErrorLogCount}}'],
  ['Stream osservati', '{{vars.logsaverStreamCount}}'],
  ['Log con firma Spot', '{{vars.logsaverSpotInterruptionLogCount}}'],
  ['Log di errore non spiegati', '{{vars.logsaverUnaccountedErrorLogCount}}'],
] as const;

export function buildRunbook(): Runbook {
  return RunbookBuilder.create(LOGSAVER_ALARM)
    .metadata({
      name: LOGSAVER_ALARM,
      description: 'Raccoglie i log del job logsaver e riconosce l’interruzione del task Fargate Spot.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-logsaver-be', 'batch', 'fargate-spot'],
    })
    .cloudExecutionPolicy({ sideEffects: 'NONE' })
    .occurrenceTimeWindow({ beforeMinutes: 60, afterMinutes: 5 })
    .output({
      metadata: { service: 'pn-logsaver-be', logGroup: LOG_GROUP, region: 'eu-south-1' },
      fields: [
        { name: 'alarmName', label: 'Alarm', ref: 'params.alarmName', valueType: 'string' },
        {
          name: 'logsaverDiagnostics',
          label: 'Diagnostica Logsaver',
          ref: 'vars.logsaverDiagnostics',
          valueType: 'string',
        },
        {
          name: 'logsaverAccountsChecked',
          label: 'Account verificati',
          ref: 'vars.logsaverAccountsChecked',
          valueType: 'string',
        },
        {
          name: 'logsaverErrorLogCount',
          label: 'Log di errore',
          ref: 'vars.logsaverErrorLogCount',
          valueType: 'integer',
        },
        {
          name: 'logsaverStreamCount',
          label: 'Stream osservati',
          ref: 'vars.logsaverStreamCount',
          valueType: 'integer',
        },
        {
          name: 'logsaverSpotInterruptionLogCount',
          label: 'Log con firma Spot',
          ref: 'vars.logsaverSpotInterruptionLogCount',
          valueType: 'integer',
        },
        {
          name: 'logsaverUnaccountedErrorLogCount',
          label: 'Log di errore non spiegati',
          ref: 'vars.logsaverUnaccountedErrorLogCount',
          valueType: 'integer',
        },
      ],
    })
    .analysisDefaults({
      runbookName: LOGSAVER_ALARM,
      resources: [{ name: 'pn-logsaver-be', type: 'Service', role: 'PRIMARY' }],
      links: [{ url: RUNBOOK_URL, name: LOGSAVER_ALARM, type: 'CONFLUENCE' }],
    })
    .step(new QueryLogsaverDiagnosticsStep(), {
      silent: true,
      evidence: [
        {
          id: 'logsaver-errors',
          label: 'Errori del job Logsaver',
          type: 'log-sample',
          filter: { field: 'queryKind', equals: 'errors' },
          retention: { mode: 'latest', limit: 5, timestampField: '@timestamp' },
        },
        {
          id: 'logsaver-streams',
          label: 'Stream del job Logsaver',
          type: 'step-output',
          filter: { field: 'queryKind', equals: 'streams' },
          retention: { mode: 'latest', limit: 5, timestampField: 'lastLog' },
        },
      ],
    })
    .knownCase(
      knownCase({
        id: 'logsaver-batch-verification-required',
        description: 'Soli errori di interruzione del task Fargate Spot',
        priority: 100,
        condition: all(
          varEquals('logsaverDiagnostics', 'COLLECTED'),
          { type: 'compare', ref: 'vars.logsaverSpotInterruptionLogCount', operator: '>', value: 0 },
          varEquals('logsaverUnaccountedErrorLogCount', '0'),
        ),
        level: 'warn',
        resolution: 'Nessuna azione necessaria',
        details: DIAGNOSTIC_DETAILS,
        analysis: { proposedStatus: 'COMPLETED', analysisType: 'ANALYZABLE', finalActions: [], links: [] },
      }),
    )
    .knownCase(
      knownCase({
        id: 'logsaver-spot-with-unaccounted-errors',
        description: 'Firma Spot presente con errori ancora da verificare',
        priority: 90,
        condition: all(
          varEquals('logsaverDiagnostics', 'COLLECTED'),
          { type: 'compare', ref: 'vars.logsaverSpotInterruptionLogCount', operator: '>', value: 0 },
          { type: 'compare', ref: 'vars.logsaverUnaccountedErrorLogCount', operator: '>', value: 0 },
        ),
        level: 'warn',
        resolution:
          'Verificare i {{vars.logsaverUnaccountedErrorLogCount}} log di errore non attribuiti alla sola interruzione Spot prima di chiudere l’occorrenza.',
        details: DIAGNOSTIC_DETAILS,
        analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [], links: [] },
      }),
    )
    .fallback(
      unknownCaseFallback('Evidenze insufficienti sul fallimento del job logsaver', [
        ['Risoluzione', 'Risoluzione non documentata.'],
      ]),
    )
    .build();
}
