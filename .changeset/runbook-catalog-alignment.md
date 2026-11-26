---
'@pagopa/go-runbook': minor
---

Il catalogo riconosce più allarmi e più casi noti, verificati sulle occorrenze reali.

- Nuovi runbook: `k8s-interop-be-m2m-audit-signer-errors`, `k8s-interop-be-ipa-certified-attributes-importer-errors`, `k8s-interop-be-notifier-seeder-errors`, `pn-delayer-residual-capacity-ErrorFatalLogs-Alarm`, `pn-MetadataStatusUpdaterLambda-ESM-Alarm` e `oncall-pn-external-channel-ErrorFatalLogs-Alarm`.
- Nuovi casi noti: il 403 nel download del dataset ISTAT (importer ISTAT), l'heartbeat Kafka di un membro sconosciuto (tenant readmodel writer SQL), il 500 di InfoCamere su `/rest/sede`, il 500 di Selfcare sugli utenti del tenant e il documento dell'e-service assente nel bucket (Selfcare 1.0 API Gateway e BFF k8s), il 504 `Endpoint request timed out` e `Document key not present in DB` (delivery-push B2B), il 409 sulla verifica della configurazione delle notifiche (notification user lifecycle consumer).
- Il runbook del notification user lifecycle consumer riconosce il conflitto sulla rimozione del ruolo api, il coordinator Kafka non disponibile ed ECONNRESET/timeout dei metadati anche negli ambienti in cui sono stati osservati, oltre a quello documentato in origine.
- La query degli errori dei job pn-delayer è condivisa tra i runbook del sender limit e della residual capacity.
