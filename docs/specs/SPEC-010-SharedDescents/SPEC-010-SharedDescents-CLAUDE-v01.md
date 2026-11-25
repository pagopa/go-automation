# SPEC-010 · Una discesa per contesto, risultato essenziale, traccia e risultato facoltativi — v01

- Stato: **bozza**, da approvare.
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

Una discesa eredita il contesto del suo nodo. La SPEC-008 ha mostrato che condividere i figli fra fratelli **senza
condizioni** è sbagliato: le variabili del nodo (per esempio `bffReadTimeout` di InfoPa) e le sue righe possono
cambiare la diagnosi a valle, e rotte, ledger, esclusioni e provenienza sono del ramo. Le copie sono però inutili
quando il sottoalbero non legge niente di ciò che distingue i fratelli: nel caso B2B gli errori di pn-delivery della
stessa richiesta hanno quasi sempre lo stesso messaggio, e i casi di pn-external-registries leggono righe e variabili
di pn-external-registries.

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

### 2.1 Un sottoalbero per discese equivalenti

Due discese di fratelli (stesso nodo padre) verso lo stesso livello, con lo stesso identificatore (tipo e valore) e
lette dallo stesso lotto, sono **equivalenti** quando il sottoalbero della prima non ha letto niente su cui la seconda
differisce. Allora la seconda riusa il sottoalbero della prima invece di enumerarne una copia.

- **Che cosa il sottoalbero legge.** Mentre il motore costruisce il sottoalbero di una discesa (enumerazione, step per
  nodo, routing, valutazione dei casi) registra le chiavi lette dal contesto ereditato: variabili (`vars`) e risultati
  degli step (`stepResults`). Il motore lo fa avvolgendo le mappe del contesto del nodo che discende; i figli le
  copiano, quindi la registrazione segue tutto il sottoalbero.
- **Il confronto.** La seconda discesa riusa il sottoalbero quando, per ogni chiave registrata, il suo contesto ha lo
  stesso valore della prima (uguaglianza dei testi per le variabili, delle identità delle righe per i risultati degli
  step) e le righe consegnate all'enumeratore, dopo il filtro delle righe antenate, sono le stesse. Altrimenti scende
  come oggi. Una registrazione in più rende il riuso più raro, mai sbagliato.
- **Che cosa resta della seconda discesa.** Il suo stato di lettura (il ledger la lega al lotto come oggi),
  `rowCount`, la pubblicazione sul suo nodo (conteggio, stato, esclusioni, variabili del livello), il suo
  `branchOutcome` calcolato dalle diagnosi raggiungibili nel sottoalbero riusato. `TreeDescent.childIds` della seconda
  discesa elenca i figli della prima.
- **Catene.** Le catene seguono `childIds`, non `parentId`: la seconda discesa ha le sue catene, che finiscono sugli
  stessi nodi; `count` conta i percorsi, `errors` gli errori distinti (`errorKey`, SPEC-008), come oggi.
- **Provenienza.** Rotta, contesto e osservazioni di un membro di catena si leggono dai `nodeIds` della catena, non
  dall'ascendenza per `parentId` (`ErrorTreeView`, `resultContexts`, bozza dell'analisi). Le rilevazioni di un nodo
  riusato sono quelle del nodo, una volta sola; le sue osservazioni sono quelle del primo percorso, che per costruzione
  ha la stessa richiesta (stesso padre).
- **Che cosa non cambia.** I nodi senza fratelli equivalenti, il routing dalle righe di contesto e il controllo dei
  cicli (stesse chiavi di percorso per fratelli dello stesso padre), il secondo tentativo con l'identificatore di
  ripiego.

Effetto atteso su B2B: i nodi di pn-external-registries scendono da circa 11.350 verso le righe distinte lette (circa
4.500) quando gli errori di pn-delivery di una richiesta hanno lo stesso messaggio; step, valutazioni, traccia e
tempo calano in proporzione.

### 2.2 Il risultato essenziale

- **Rilevazioni per occorrenza.** `outcome.detections` ha una voce per caso e insieme di identificatori osservati
  (l'occorrenza), non per nodo: `errors` (errori distinti), `firstSeenAt`, `lastSeenAt`, `evidenceRows` sommato, un
  `resolvedMessage` (quello della prima rilevazione), le osservazioni dell'occorrenza. Il confronto di Watchtower
  continua a usare gli identificatori della propria occorrenza. Su B2B: da 10.716 a circa 160 voci.
- **Messaggio.** `outcome.message` nomina ogni caso una volta, con il numero di errori: «Individuati 4 casi noti:
  ReadTimeout del downstream SelfcarePG (2.664 errori) | …».
- **Percorsi delle catene.** `chains[].members`, l'elenco di ogni percorso con chiave e correlazione, esce dal
  risultato (D3); restano `samples` (10 per gruppo), `routes`, `count`, `errors`, gli intervalli e le osservazioni del
  gruppo. L'elenco completo resta nella traccia, quando la si salva.
- `RUNBOOK_OUTPUT_SCHEMA_VERSION` passa a `4.0.0` (forma delle rilevazioni cambiata); `CACHE_FINGERPRINT_VERSION`
  sale; `matchAnalysis`, `classifyRunbookOutcome` e i loro test seguono la nuova forma.
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

- Riuso: due fratelli con lo stesso identificatore e un sottoalbero che non legge le loro variabili condividono i
  figli (un'enumerazione, nodi non duplicati, due catene, `errors` 1); due fratelli che differiscono in una variabile
  letta a valle (il caso InfoPa `bffReadTimeout` con valori opposti, in entrambi gli ordini) scendono ognuno con i suoi
  figli e le diagnosi di oggi; righe consegnate diverse impediscono il riuso; ledger, esclusioni (`specificDiagnosis`)
  e `branchOutcome` per discesa come oggi; i test dell'albero e dell'inventario restano verdi.
- Provenienza: la bozza dell'analisi e il contesto di un membro di una catena riusata usano i nodi della catena.
- Risultato: rilevazioni per occorrenza, messaggio con i casi distinti, `chains` senza `members`; `matchAnalysis`
  sceglie lo stesso caso di oggi sugli scenari dei suoi test.
- Parametri: le quattro combinazioni salvano solo i file chiesti.
- `pnpm check` verde. L'esecuzione B2B rifatta dal committente: nodi, step, tempo del lavoro sull'albero e dimensioni
  dei file a confronto con quella delle 21:38.

## 4. Fuori

- Il contenuto della traccia (resta completa, scelta D3 della SPEC-008).
- La durata delle query (SPEC-009).

## 5. Le scelte del committente

- **D1 — Riuso dei sottoalberi.** Proposta: solo fra discese equivalenti (2.1). Alternativa: una discesa per richiesta
  senza condizioni (più semplice, ma perde le diagnosi che dipendono dal ramo, come InfoPa).
- **D2 — Rilevazioni nel risultato.** Proposta: una per caso e occorrenza (2.2). Alternativa: una per caso, con
  l'unione degli identificatori (più piccola, ma Watchtower confronterebbe identificatori di occorrenze diverse).
- **D3 — Percorsi delle catene nel risultato.** Proposta: togliere `members` (restano campioni, rotte e conteggi). Si
  perde nel risultato l'elenco completo dei percorsi con chiave e correlazione, che oggi nessun consumatore legge.
- **D4 — Default dei parametri.** Proposta: `output.trace` falso, `output.result` vero.
