# SPEC-011 · Query pronte per tipo di allarme — registro delle revisioni

## Origine (25 novembre 2026)

Il committente chiede di rendere facoltativo `queryAwsCloudWatch` nel file di configurazione di
go-report-error-patterns e di scegliere la query in base al tipo di allarme. Per gli allarmi k8s il `pod_app` si
ricava dal nome dell'allarme, come nella query condivisa da Gaspare Perricone. La proposta deve poter gestire anche
altri tipi di allarme.

## Versioni

| Versione | File                                         | SHA256                                                             |
| -------- | -------------------------------------------- | ------------------------------------------------------------------ |
| v01      | `SPEC-011-AlarmQueryTemplates-CLAUDE-v01.md` | `ec8c9862027f7ab50a68b328fc1cdbf21d16fccc8d5e7a3ad80b7cc2c3d1965d` |
| v02      | `SPEC-011-AlarmQueryTemplates-CLAUDE-v02.md` | `ad45b24ddf06efea94285f351d0f8303da65325f706c02c607f8a97a0b435341` |

## Scelte del committente (25 novembre 2026)

D1 catalogo nel codice TypeScript; D2 pod ricavato nel codice, con la proposta di Claude su come farlo al meglio;
D3 la condizione sui 5xx resta; D4 da chiarire; D5 risoluzione dei token con i filtri del modello; D6 query e log
group tolti dai file di `configs/`; D7 errore per un allarme senza modello e senza query.

## Esecuzione API Gateway (25 novembre 2026)

`interopApiConfig.json` con `resolveStaticTokens: true` dà `<*> - <*> - <*>` invece di `<*> - 504 - <*>`: la query di
risoluzione cerca in `@message` sull'intero log group, mentre il pattern nasce dal campo `msg` costruito con `concat`.
Il committente precisa che il campo, la sua composizione e il suo nome cambiano da query a query.

## Scelta del committente (25 novembre 2026)

D8 query a mano strutturata (`lines` + `patternField`) al posto della stringa `queryAwsCloudWatch`.

## v02 (25 novembre 2026)

Riporta D1–D3 e D5–D8. La risoluzione dei token riparte dalle righe di qualunque query, con una regex al posto del
glob. Nuova D9 sul modello API Gateway; D4 resta aperta in attesa di una riga di log reale.
