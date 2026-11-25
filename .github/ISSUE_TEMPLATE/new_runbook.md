---
name: Nuovo runbook
about: Richiedi o traccia l'aggiunta di un runbook al catalogo go-runbook
title: 'runbook: '
labels: runbook
assignees: ''
---

## Allarme / prodotto Watchtower

- Nome allarme (`alarmName`) o `key` di catalogo:
- Prodotto Watchtower (es. SEND, PN, IO):
- Il runbook copre più allarmi? Se sì, elencali.

## Pagina Confluence di origine

<!-- Link alla pagina del Confluence space GO da cui deriva la procedura -->

## Known case previsti

<!-- Elenca i casi noti attesi: condizione di match e azione associata -->

1.
2.

## Note di implementazione

<!-- Step previsti, sorgenti dati coinvolte (CloudWatch, Athena, DynamoDB, HTTP), eventuali sub-pipeline -->

---

Riferimenti: `docs/RUNBOOKENGINE.md` per il motore e la reference step/API
builder; skill `runbook-authoring` per lo scaffolding
(`pnpm create:runbook`), la registrazione nel manifest e la verifica con
`go-cli runbook show/list --refresh`.
