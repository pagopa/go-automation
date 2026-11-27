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
| v03      | `SPEC-011-AlarmQueryTemplates-CLAUDE-v03.md` | `138039e60b27c75ca74af78409f017d01d3448d9d267257c283708a27f19e82a` |
| v04      | `SPEC-011-AlarmQueryTemplates-CLAUDE-v04.md` | `d6d5170e234acd57c60f04b5ffe4a32b53f5e465f3311b64b779aff2124a1b62` |
| v05      | `SPEC-011-AlarmQueryTemplates-GEMINI-v05.md` | `45dc153c6d1c2ad3583697b9bfc955370d7cc4f180cee17fb92456041e37e10b` |

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

## Richiesta del committente (26 novembre 2026)

Ridurre al minimo le query su CloudWatch: scaricare una sola volta i log di ogni occorrenza, ricavare i pattern in
locale con Drain (drain-ts) al posto del comando `pattern`, ricavare dai pattern le regex che filtrano le righe e
verificare in locale la stabilità locale e globale dei token, con lo stesso criterio della risoluzione su CloudWatch.

## v03 (26 novembre 2026)

Riporta la v02. Aggiunge il motore `drain`: una query per occorrenza che legge le righe del campo, un modello Drain per
allarme, regex dal modello, stabilità dei token in locale senza query; misura query e byte analizzati per entrambi i
motori. Nuove D10 (motore predefinito), D11 (libreria), D12 (masking e ripristino), D13 (letture oltre 10.000 righe);
restano aperte D4 e D9.

## Scelta del committente (26 novembre 2026)

D12, prima parte: per ora solo le maschere UUID ed esadecimali. IP e numeri restano a Drain, perché in addestramento i
token mascherati non contano nella somiglianza e sulle righe corte dividerebbero lo stesso errore in più pattern.

## v04 (26 novembre 2026)

Riporta la v03 con la prima parte di D12: maschere UUID ed esadecimali con `0x`, il motivo per cui IP e numeri ne
restano fuori, esempi e test aggiornati. Resta aperta la seconda parte di D12 (maschere rese come `<*>`,
`resolveStaticTokens` acceso per `drain`, soglia di 2 righe), con D4, D9, D10, D11 e D13.

## Scelte del committente (27 novembre 2026)

- D4 e D9: la forma dei log e la scrittura delle query competono a chi gestisce i log e il relativo allarme; valori
  puntuali (come `apigwId`) si passano tramite `queryVariables`.
- D10: motore predefinito `drain`, con possibilità di passare a `cloudwatch` specificandolo voce per voce.
- D11: libreria esterna `@agentix-e/drain-ts` con versione 1.1.1 bloccata nel catalogo del workspace.
- D12, seconda parte: etichette descrittive `<UUID>` e `<HEX>` nei report finali; `resolveStaticTokens: true` di default
  per `drain`; soglia di almeno 2 righe complessive per ripristinare un token costante.
- D13: nessun partizionamento della finestra temporale; se le righe superano 10.000 viene emesso un avviso di
  troncamento e si analizzano le prime 10.000 righe lette.

## v05 (27 novembre 2026)

Redatta da Gemini in continuità con il ciclo v01–v04. Tutte le decisioni (D1–D13) sono chiuse e approvate. La specifica
è pronta per l'implementazione.
