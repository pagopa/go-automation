# SPEC-010 · Errori identici uniti, risultato essenziale, traccia e risultato facoltativi — v02

- Stato: **bozza**, da approvare.
- Rispetto alla v01: il primo giro di Codex mostra che il riuso dei sottoalberi fra discese «equivalenti» non è
  sicuro in questo motore (i casi si valutano alla fine, rotte, ledger e contesto sono del ramo). Il committente
  sceglie di unire gli errori identici della stessa richiesta (D1 rivista); accolti anche chiave dell'occorrenza,
  varianti dei messaggi (D5) e percorsi completi nella traccia.
- Autore: Claude.
- Origine: l'esecuzione di `pn-delivery-B2B-ApiGwAlarm` del 25 ottobre 2026 rifatta dal committente il 22 novembre
  (21:38) dopo la SPEC-009: meno byte scansionati, ma tempo quasi doppio.

## 1. Perché

### 1.1 Le due esecuzioni

|                                          | 18:24 (prima della SPEC-009) | 21:38 (dopo)   |
| ---------------------------------------- | ---------------------------- | -------------- |
| Byte scansionati                         | 1,9 GB                       | 806 MB         |
| Righe di pn-external-registries          | 2.000 di 4.513 (sature)      | 4.513          |
| Nodi d'errore / errori distinti          | 6.284 / 2.242                | 11.744 / 3.655 |
| Step eseguiti                            | 6.631                        | 12.088         |
| Lavoro sull'albero (dopo l'ultima query) | 36 s                         | 87 s           |
| Durata del runbook / totale              | 54 s / 73 s                  | 118 s / 157 s  |
| Traccia / risultato                      | 3 GB / 40 MB                 | 6 GB / 97 MB   |

L'attribuzione delle righe non pesa (misurata: 0,17 s per 99 × 4.513). Il tempo va nei nodi: ogni errore di
pn-delivery di una richiesta scende a pn-external-registries con lo stesso trace e riceve tutte le righe di quel trace;
ognuno crea la sua copia dei figli, che esegue i suoi step e valuta tutti i casi noti. Leggere tutte le righe (SPEC-009)
ha moltiplicato le copie.

### 1.2 Perché le copie esistono

Una discesa eredita il contesto del suo nodo. Condividere i figli fra fratelli non è sicuro: la SPEC-008 l'ha
scartato senza condizioni, e il primo giro di questa specifica l'ha scartato anche fra discese «equivalenti», perché il
motore valuta i casi solo dopo tutte le discese (la prova di equivalenza arriverebbe dopo il riuso), le rotte delle
righe di contesto restano sul nodo che legge, le lacune del ledger dipendono dallo scope del ramo e il contesto della
foglia porta le variabili di un solo ramo.

Nel caso B2B le copie nascono da righe d'errore di pn-delivery **identiche** della stessa richiesta («Error during
retrieve of the groups» ripetuto): stesso messaggio, stessa chiamata successiva, stesso trace. Sono la stessa
evidenza ripetuta, e ognuna crea un nodo con lo stesso contesto.

### 1.3 Il risultato

Il file del risultato (84 MB di JSON) è quasi tutto `outcome.detections`:

| Parte                | Peso    | Contenuto                                                                                                    |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `outcome.detections` | 81,1 MB | 10.716 rilevazioni, una per nodo: messaggio dell'azione risolto (fino a 4 KB) e osservazioni (fino a 3,6 KB) |
| `chains`             | 2,7 MB  | 6 gruppi, di cui `members` 11.380 percorsi (2,1 MB)                                                          |
| `outcome.message`    | 0,7 MB  | «Individuati 10716 casi noti: …» con la descrizione di ogni rilevazione                                      |
| il resto             | 0,2 MB  | contesto, copertura, telemetria                                                                              |

Le 10.716 rilevazioni sono 4 casi su 157 insiemi di identificatori distinti (le richieste): il caso
`external-registries-selfcarepg-read-timeout` compare 10.035 volte. Chi le legge: `classifyRunbookOutcome` (gli id dei
casi) e il confronto con l'analisi di Watchtower (`matchAnalysis.detectedCases`: caso, descrizione, messaggio e
identificatori **della propria occorrenza**, mai di un'altra).

go-analyze-alarm salva sempre traccia e risultato: 6 GB di traccia e 38 s di scrittura anche quando servono solo la
console o il risultato.

## 2. La proposta

### 2.1 Errori identici della stessa richiesta: un nodo

- Un livello di servizio SEND può dichiarare che unisce gli errori identici (`mergeIdenticalErrors` del servizio,
  facoltativo, falso per difetto). B2B lo dichiara per pn-delivery; gli altri runbook non cambiano.
- In un livello che lo dichiara, l'enumeratore (`enumerateServiceErrors`) fa un solo nodo delle righe d'errore che,
  per lo stesso identificatore, hanno le stesse variabili del nodo (messaggio, URL e target della chiamata successiva,
  fallback UUID, variabili del trace) e la stessa correlazione. Il nodo ha la chiave, l'etichetta e l'orario della
  prima riga, tutte le righe in `scopedOutputs` e `rowIdentities`, e il numero delle righe unite
  (`ErrorTreeNode.occurrences`, solo quando sono più di una).
- Il nodo è uno, con un solo contesto: discende una volta, e routing, ledger, esclusioni, casi e provenienza restano
  quelli di oggi per quel nodo. `errorKey` è quello delle sue righe: le righe unite sono un errore.
- Righe che differiscono in una variabile del nodo (un messaggio diverso, un'altra chiamata) restano nodi distinti.

Effetto atteso su B2B: tanti nodi di pn-delivery in meno quante sono le righe ripetute, e per ognuno una copia in meno
dei figli di pn-external-registries. La misura è quella dell'esecuzione rifatta.

### 2.2 Il risultato essenziale

- **Rilevazioni per occorrenza.** `outcome.detections` ha una voce per caso e occorrenza, non per nodo. L'occorrenza
  è la richiesta: la chiave usa gli identificatori tipizzati in forma canonica (`canonicalTraceId` per i `traceId`, il
  `requestId` così com'è) e tiene distinti i ripieghi di richieste diverse; le osservazioni conservate restano quelle
  rilevate, senza doppioni. Nel risultato B2B delle 18:18 quattro rilevazioni della stessa richiesta, con header X-Ray
  grezzi diversi dello stesso Root, diventano una voce.
- Ogni voce ha `errors` (errori distinti), `firstSeenAt`, `lastSeenAt`, `evidenceRows` sommato, `resolvedMessage` (il
  primo, come riepilogo) e `resolvedMessages`, le varianti distinte in ordine di tempo (D5): il confronto lessicale di
  Watchtower e il testo inviato a GO-AI vedono gli stessi segnali di oggi (in 84 occorrenze B2B un messaggio successivo
  porta `groups-all`).
- **Messaggio.** `outcome.message` nomina ogni caso una volta, con il numero di errori: «Individuati 4 casi noti:
  ReadTimeout del downstream SelfcarePG (2.664 errori) | …».
- **Percorsi delle catene.** `chains[].members`, l'elenco di ogni percorso con chiave e correlazione, esce dal
  risultato (D3): le catene del risultato sono `ErrorChainSummary` (il gruppo senza `members`); restano `samples` (10
  per gruppo), `routes`, `count`, `errors`, gli intervalli e le osservazioni del gruppo. Oggi la traccia salvata non
  contiene le catene: il file della traccia aggiunge `chains`, i gruppi completi con `members`, ripuliti dai nomi dei
  profili come il resto.
- `RUNBOOK_OUTPUT_SCHEMA_VERSION` passa a `4.0.0` (forma delle rilevazioni cambiata); `CACHE_FINGERPRINT_VERSION`
  sale; `matchAnalysis` (una candidata per variante del messaggio, con gli identificatori dell'occorrenza), `classifyRunbookOutcome`
  e i loro test seguono la nuova forma.
- Il contratto `contracts/runbook-automation/v1` di go-watchtower non contiene la forma del risultato (verificato il
  22 novembre): il cambio resta in questo repository; il risultato non è mai stato rilasciato in produzione.

### 2.3 Traccia e risultato facoltativi

go-analyze-alarm ha due parametri distinti:

| Parametro       | Alias | Tipo | Default | Effetto                         |
| --------------- | ----- | ---- | ------- | ------------------------------- |
| `output.trace`  | `otr` | BOOL | D4      | salva `trace-{alarmName}.json`  |
| `output.result` | `ors` | BOOL | D4      | salva `result-{runbookId}.json` |

Senza traccia il risultato non ha `traceFile`; senza nessuno dei due la sezione «Output» non elenca file. La console
(riepilogo, catene, copertura, telemetria) non cambia. I parametri valgono in `single` e in `range`.

## 3. Test e verifica

- Unione: due righe d'errore identiche della stessa richiesta in un livello che la dichiara fanno un nodo con due
  righe e `occurrences` 2, che discende una volta; righe con un messaggio o una chiamata diversi restano due nodi; un
  livello che non la dichiara resta come oggi; i test di InfoPa, dell'albero e dell'inventario restano verdi.
- Risultato: le quattro rilevazioni B2B della stessa richiesta (header X-Ray diversi) fanno una voce; due messaggi
  diversi della stessa occorrenza restano entrambi in `resolvedMessages`; `outcome.message` con i casi distinti;
  `chains` senza `members`; `matchAnalysis` sceglie lo stesso caso di oggi sui suoi scenari, anche con due varianti.
- Traccia: `chains` con tutti i membri, oltre i dieci campioni, senza nomi di profilo.
- Parametri: le quattro combinazioni salvano solo i file chiesti.
- `pnpm check` verde. L'esecuzione B2B rifatta dal committente: nodi, step, tempo del lavoro sull'albero e dimensioni
  dei file a confronto con quella delle 21:38.

## 4. Fuori

- Il contenuto della traccia (resta completa, scelta D3 della SPEC-008).
- La durata delle query (SPEC-009).

## 5. Le scelte del committente

- **D1 — Punto 3 (22 novembre 2026, rivista dopo il primo giro).** Unire gli errori identici della stessa richiesta, in
  un livello che lo dichiara (2.1). Il riuso fra discese equivalenti è scartato.
- **D2 — Rilevazioni nel risultato (22 novembre 2026).** Una per caso e occorrenza.
- **D3 — Percorsi delle catene nel risultato (22 novembre 2026).** Fuori dal risultato; i percorsi completi vanno nella
  traccia.
- **D4 — Default dei parametri (22 novembre 2026).** `output.trace` falso, `output.result` vero.
- **D5 — Messaggi di un'occorrenza (22 novembre 2026).** Il primo come riepilogo e le varianti distinte.
