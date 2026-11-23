# SPEC-008 · Esecuzioni grandi: albero duplicato e traccia che non si salva — v01

- Stato: **bozza**, da approvare.
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

### 2.1 L'albero: un sottoalbero per identificatore

Quando più discese dello stesso nodo-livello (stesso livello di destinazione, stesso identificatore) leggono le stesse
righe, i figli si enumerano **una volta**: la prima discesa (in ordine di creazione) li ha come figli; le altre
registrano lo stesso esito di lettura e un riferimento al sottoalbero già enumerato, senza ricrearlo. Le catene delle
discese che rimandano restano complete e finiscono sul sottoalbero condiviso.

Effetti: nodi, step per nodo, valutazioni e traccia proporzionali agli errori distinti; i conteggi delle catene
contano gli errori, non le copie. Cambia la forma dell'output (`chains`, `coverage.levels`) e dei conteggi: è un
cambio di comportamento da decidere (D1).

### 2.2 Scrivere un JSON grande: un componente di go-common

Indipendentemente da 2.1, una traccia può crescere oltre il limite in un'esecuzione grande. Tre strade:

- **A. Writer JSON in streaming in `@pagopa/go-common/json`.** Un componente con un nome e un'interfaccia
  (`GOJSONStreamWriter`: scrive un valore su uno stream a pezzi, con lo stesso testo di `JSON.stringify`), i suoi test
  di equivalenza e la sua documentazione in `docs/GOCOMMON.md`; `GOJSONFileExporter` lo usa sempre. È un cambio di
  go-common, generico (ogni esportazione di un valore grande ne beneficia).
- **B. Traccia divisa con gli strumenti di oggi.** go-analyze-alarm scrive la testata della traccia con
  `GOJSONFileExporter` e gli step (`pipeline`) e le valutazioni (`caseMatching.evaluations`) con
  `GOJSONListExporter.exportStream()` in file JSONL accanto. Nessun cambio a go-common; cambia la forma dei file della
  traccia (oggi un solo JSON).
- **C. Traccia più leggera.** Ogni step tiene nella traccia il conteggio e un campione limitato delle righe lette
  invece di tutte. Riduce di un ordine di grandezza, ma toglie informazione dalla traccia: è una perdita di
  funzionalità e va decisa esplicitamente.

## 3. Test e verifica

- 2.1: un albero con due fratelli che scendono con lo stesso identificatore: un solo sottoalbero, due catene che lo
  raggiungono, conteggi uguali al numero di errori distinti; i test dell'albero e dell'inventario esistenti.
- 2.2 A: equivalenza byte per byte con `JSON.stringify` su valori di ogni tipo (`toJSON`, valori omessi, numeri non
  finiti, oggetti vuoti, indentazione, struttura circolare), e un valore oltre il limite di una stringa.
- 2.2 B: i file della traccia si rileggono e ricompongono la traccia di oggi.
- `pnpm check` verde; l'esecuzione del 25 ottobre rifatta dal committente salva traccia e risultato.

## 4. Fuori

- Il fallimento della query sugli execution log (`MalformedQueryException`, retention del log group più corta della
  data dell'allarme): è un limite dell'account, già trattato come lettura `unavailable`.
- Le sezioni della console (già corrette a parte, con il loro changeset).

## 5. Le scelte del committente

- **D1 — Albero (22 novembre 2026).** Un sottoalbero condiviso per identificatore (2.1).
- **D2 — Scrittura di un JSON grande (22 novembre 2026).** A: `GOJSONStreamWriter` in `@pagopa/go-common/json`, usato
  da `GOJSONFileExporter`.
- **D3 — Traccia più leggera (22 novembre 2026).** No: la traccia resta completa.
