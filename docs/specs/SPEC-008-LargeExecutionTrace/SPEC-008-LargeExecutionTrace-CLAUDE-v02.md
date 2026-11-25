# SPEC-008 · Esecuzioni grandi: albero duplicato e traccia che non si salva — v02

- Stato: **approvata** dal committente il 22 novembre 2026 («tutto insieme, procedi subito»).
- Rispetto alla v01: accoglie i 7 rilievi del primo giro di Codex. D1 non condivide più i nodi (contesto, routing,
  ledger e provenienza sono per ramo): conta gli errori distinti (§2.1). D2 ha un contratto, la backpressure e la
  pubblicazione atomica del file (§2.2).
- Autore: Claude.
- Origine: l'esecuzione di `pn-delivery-B2B-ApiGwAlarm` del 25 ottobre 2026 (23:01:45Z) con go-analyze-alarm, finita
  con `Error: Invalid string length` dopo il riepilogo.

## 1. Perché

### 1.1 Che cosa succede

- Il runbook completa: 6.631 step eseguiti, 6.284 nodi d'errore, 5.243 riconosciuti.
- go-analyze-alarm stampa il riepilogo e fallisce salvando la traccia (`saveExecutionTrace`): il risultato non viene
  scritto. `GOJSONFileExporter` costruisce l'intero testo con `JSON.stringify(data, null, 2)` e la stringa supera la
  lunghezza massima di una stringa di V8.
- Misura su una traccia salvata (INAD, 75 step): 4,5 MB, di cui il 52% nell'`output` degli step (le righe lette) e il
  44% in `caseMatching` (le valutazioni dei casi noti). Con 6.631 step la traccia arriva a centinaia di MB.

### 1.2 La causa a monte: l'albero ricopia i figli

In `engine/tree/ErrorTreeExecutor.ts` · `attach`, ogni discesa riceve **tutte** le righe lette per il suo
identificatore. Quando più nodi fratelli scendono allo stesso livello con lo stesso identificatore, ognuno enumera gli
stessi figli dalle stesse righe. Nell'esecuzione:

- circa 278 errori di pn-delivery su 113 richieste; gli errori della stessa richiesta scendono a pn-external-registries
  con lo stesso trace;
- le due letture di pn-external-registries (1.000 righe ciascuna, sature) danno a ognuno di quei fratelli le stesse
  righe: circa 5.900 nodi di pn-external-registries, i gruppi «×4575» e «×659».

La lettura è una sola (le query non si moltiplicano), ma si moltiplicano nodi, step per nodo, valutazioni e traccia. I
conteggi del riepilogo (`×4575`) contano copie dello stesso errore, non errori diversi.

### 1.3 Che cosa c'è già in go-common

- `GOJSONFileExporter` (`exporters/json`): un valore, una scrittura, tutto in memoria.
- `GOJSONListExporter.exportStream()` (`exporters/json`): scrive una lista elemento per elemento (array JSON o JSONL)
  attraverso `GOListExporterStreamWriter`, senza tenere tutta la lista come testo.

## 2. Le parti della proposta

### 2.1 L'albero: un nodo per percorso, gli errori contati una volta

Condividere i figli fra genitori non è corretto: i figli ereditano variabili e scope del genitore (per esempio
`bffReadTimeout` scritto da `FlagBffReadTimeoutStep` decide `external-registries-response-already-committed`), le rotte
dalle righe di contesto e il controllo dei cicli sono per genitore, il ledger pubblica per genitore conteggio, stato ed
esclusioni (`specificDiagnosis=absent`), e contesto, osservazioni e bozza di una rilevazione si ricostruiscono dal suo
percorso. Ogni percorso resta quindi con i suoi nodi.

Ciò che cambia è il conteggio:

- `ErrorTreeNode.rowKey`: l'identità delle righe proprie del nodo (`rowIdentity` del livello sulle sue righe), quando
  il livello la dichiara;
- `ErrorChainGroup.errors`: il numero di errori distinti in cui finiscono i percorsi del gruppo (le `rowKey` distinte
  dei nodi finali; un nodo senza `rowKey` conta per sé). `count` resta il numero dei percorsi, su cui si calcolano le
  rotte;
- il riepilogo (righe e albero delle catene) mostra gli errori distinti e, quando sono meno dei percorsi, anche i
  percorsi: «45 errori (4575 percorsi)»;
- la riga «Errori senza caso noto» conta le foglie distinte per `rowKey`.

`RUNBOOK_OUTPUT_SCHEMA_VERSION` passa a `3.1.0` (campo aggiunto); `CACHE_FINGERPRINT_VERSION` sale.

### 2.2 Scrivere un JSON grande: un componente di go-common

Indipendentemente da 2.1, una traccia può crescere oltre il limite in un'esecuzione grande. Tre strade:

- **A. Writer JSON in streaming in `@pagopa/go-common/json`.** `GOJSONStreamWriter`, con contratto:
  - `new GOJSONStreamWriter({ indent? })`, `write(value, stream): Promise<void>`: scrive su `stream` lo stesso testo di
    `JSON.stringify(value, null, indent)` a pezzi, rispettando la backpressure (aspetta `drain` quando `write`
    restituisce `false`);
  - non chiude lo stream: lo chiude chi l'ha aperto; la promessa si risolve quando l'ultimo pezzo è accettato, si
    rifiuta con l'errore della serializzazione (struttura circolare, `BigInt`) o dello stream;
  - esportato da `src/json/index.ts`, nel report API, documentato in `docs/GOCOMMON.md`.

  `GOJSONFileExporter` (opzioni invariate) scrive in un file temporaneo univoco nella stessa cartella con
  `GOJSONStreamWriter`, lo chiude e lo rinomina sul percorso finale; in caso d'errore toglie il temporaneo: un file
  valido già presente resta, e un'esportazione fallita non lascia un JSON parziale.

- **B. Traccia divisa con gli strumenti di oggi.** go-analyze-alarm scrive la testata della traccia con
  `GOJSONFileExporter` e gli step (`pipeline`) e le valutazioni (`caseMatching.evaluations`) con
  `GOJSONListExporter.exportStream()` in file JSONL accanto. Nessun cambio a go-common; cambia la forma dei file della
  traccia (oggi un solo JSON).
- **C. Traccia più leggera.** Ogni step tiene nella traccia il conteggio e un campione limitato delle righe lette
  invece di tutte. Riduce di un ordine di grandezza, ma toglie informazione dalla traccia: è una perdita di
  funzionalità e va decisa esplicitamente.

## 3. Test e verifica

- 2.1: due fratelli che scendono con lo stesso identificatore e trovano le stesse righe: due percorsi, un errore
  distinto, `errors` 1 e `count` 2; i test dell'albero e dell'inventario esistenti restano verdi.
- 2.2 A: equivalenza byte per byte con `JSON.stringify` su valori di ogni tipo (`toJSON`, valori omessi, numeri non
  finiti, oggetti vuoti, indentazione); uno stream lento (il buffer non supera la soglia); uno stream che fallisce;
  una struttura circolare che lascia intatto il file precedente e nessun file alla prima esportazione.
- 2.2 B: i file della traccia si rileggono e ricompongono la traccia di oggi.
- `pnpm check` verde; l'esecuzione del 25 ottobre rifatta dal committente salva traccia e risultato.

## 4. Fuori

- Il fallimento della query sugli execution log (`MalformedQueryException`, retention del log group più corta della
  data dell'allarme): è un limite dell'account, già trattato come lettura `unavailable`.
- Le sezioni della console (già corrette a parte, con il loro changeset).

## 5. Le scelte del committente

- **D1 — Albero (22 novembre 2026).** Il committente aveva scelto un sottoalbero condiviso; la revisione mostra che non
  è corretto (§2.1). Resta l'obiettivo: errori contati una volta, un nodo per percorso. Il committente chiede di
  procedere con tutto insieme.
- **D2 — Scrittura di un JSON grande (22 novembre 2026).** A, con il contratto di §2.2.
- **D3 — Traccia più leggera (22 novembre 2026).** No: la traccia resta completa.
