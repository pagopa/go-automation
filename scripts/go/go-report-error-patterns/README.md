# go-report-error-patterns

Script in TypeScript per analizzare le occorrenze di attivazione di un allarme CloudWatch ed estrarre i relativi pattern di errore dai CloudWatch Logs tramite pattern analysis.

## Funzionalità

- Interroga lo storico di attivazione dell'allarme (`AWSCloudWatchAlarmsService.describeAlarmStateTransitions`).
- Per ogni transizione in stato `ALARM`, estrae i timestamp dei datapoint responsabili dell'attivazione (`evaluatingDatapoints`).
- Calcola in automatico la finestra temporale `[queryStartTime, queryEndTime]` mirata sui log, riducendo al minimo il volume di log scansionati.
- Esegue la query di pattern analysis sui CloudWatch Logs (`AWSCloudWatchLogsService.query`).
- Genera un report aggregato con:
  - Frequenza con cui ciascun pattern è risultato presente durante l'attivazione dell'allarme.
  - Tabella di dettaglio per singola attivazione (timestamp, finestra temporale, numero pattern rilevati).

## Parametri CLI

- `-aps, --aws-profiles <p1,p2...>`: array di profili AWS da analizzare (es. `--aws-profiles core-dev,core-prod`).
- `-f, -cf, --config-file <path>`: percorso al file di configurazione JSON.

## File di configurazione (`configs/config.json`)

```json
{
  "alarm-name": "my-service-5xx-errors-alarm",
  "alarm-history-start-date": "2026-11-01T00:00:00Z",
  "alarm-history-end-date": "2026-11-03T23:59:59Z",
  "log-group": "/aws/ecs/my-service",
  "query aws cloudwatch": "fields @timestamp, @message | filter @message like /ERROR/ | pattern @message",
  "buffer-seconds": 30
}
```

Supporta sia un singolo oggetto JSON che un array di oggetti configurazione per analizzare più allarmi in sequenza.

## Esecuzione

```bash
# Build
pnpm run build

# Esecuzione
node dist/index.js --aws-profiles <profilo> --config-file configs/config.json
```
