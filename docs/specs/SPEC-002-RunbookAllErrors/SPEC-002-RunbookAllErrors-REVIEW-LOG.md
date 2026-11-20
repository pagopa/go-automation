# SPEC-002 · Registro delle revisioni

## La richiesta del committente

- 19 novembre 2026: «Runbook Automation ovvero go-runbook, vorrei cambiare le logiche alla base ovvero quella di
  selezionare il primo errore noto rilevato in base alla sua priorità. Vorrei proprio togliere il concetto di
  priorità, la runbook automation dovrebbe rilevare TUTTI gli errori che ci sono e in caso metterli in ordine di
  timing. Analizza nel dettaglio la richiesta e poi scrivi una spec dedicata».

## La v01

- Specifica: `SPEC-002-RunbookAllErrors-CLAUDE-v01.md`, SHA256
  `b9b7e3111b6fa24b1e300201e8008c963d366c432672b4897c356745afdf09e7`. È l'hash dopo la modifica del committente alla
  riga «Origine»; la stesura di Claude aveva `50a9b58e6e26531c62b1f83f4621f9c2715a89434c899f2132f4d9940dc51535`.
- Fonti: lettura del codice di `packages/go-runbook` (motore, valutatore delle condizioni, output, bozza di analisi,
  famiglie API Gateway e Lambda, catalogo), dei consumatori in `scripts/go` e `packages/go-watchtower-runbook` e
  dello schema `analysis-draft-v1` di Watchtower in `contracts/runbook-automation/v1/upstream/`. I conteggi (72
  runbook, 302 valori di `priority`, 26 condizioni su circa 245 basate solo su variabili) vengono da una ricerca sul
  checkout del 19 novembre 2026.
- Stato: bozza, in attesa delle scelte D1–D9 e dell'approvazione del committente.

## Primo giro di revisione (Codex)

- Richiesta del committente: «fai review codex», il 19 novembre 2026.
- Revisore: Codex CLI 0.170.0, modello `gpt-6.2-sol`, sforzo `high`, sandbox in sola lettura; sessione
  `01a1f420-5d48-7722-a9dd-26c54fc107b1`. Piano rivisto: v01, SHA256 `b9b7e311…09e7`.
- Esito: **REVISE**, 12 rilievi (9 alti, 2 medi, 1 basso). Claude ha verificato i rilievi sul codice prima di
  deciderli.

| Rilievo | Gravità | In breve                                                                                                                                    | Decisione                                                                                                                                                                                                                                                                                                    |
| ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 01      | alta    | Le query di enumerazione (access log per gravità, Lambda `desc`) con `limit 1000` perdono gli errori più vecchi                             | **Accolto.** Enumerazione ordinata `@timestamp asc`; saturazione dichiarata (`complete: false`, «almeno N»), `IN_PROGRESS`. Paginazione fuori (§3.3, §5).                                                                                                                                                    |
| 02      | alta    | Authorizer ed execution log leggono tutto l'access log: evidenza di una richiesta attribuita a un'altra                                     | **Accolto.** Parte di finestra e parte per errore; i due step leggono solo la riga dell'errore attivo; execution log in un lotto diviso per requestId; le sonde di finestra restano evidenza di finestra (§3.3).                                                                                             |
| 03      | alta    | `executeSubPipeline` non segue `goTo`, non restituisce gli output e si ferma al primo fallimento                                            | **Accolto.** Il blocco per errore usa il ciclo degli step del motore, con indice limitato, `goTo`, protezione dai cicli, `stop` locale; iterazione fallita registrata senza fermare le altre; abort globale (§3.3).                                                                                          |
| 04      | alta    | Lambda multi-account: la query delle invocazioni legge l'intera finestra; recupero del requestId dal messaggio                              | **Accolto.** Chiave sorgente più requestId, query sull'invocazione attiva o lotto diviso, recupero dal messaggio mantenuto, errore «non attribuito» esplicito (§3.3).                                                                                                                                        |
| 05      | alta    | Interop API GW lavora su aggregati con il solo `latestTimestamp`                                                                            | **Accolto.** Lettore del tempo con primo, ultimo e peso; le query aggregate aggiungono `earliest(@timestamp)` (§1.3, §3.2, §3.6).                                                                                                                                                                            |
| 06      | alta    | Service e downstream scelgono un messaggio rappresentativo e il primo trace id (caso SelfcarePG)                                            | **Accolto.** L'affermazione della v01 «per service e downstream basta il lavoro sui casi» era sbagliata. Le due famiglie entrano nell'analisi per errore (F4) e nella copertura di F1 (§1.3, §3.3).                                                                                                          |
| 07      | alta    | `supersedes` per caso cancella errori di altre richieste; `all(...)` mescola richieste; righe contate due volte                             | **Accolto in parte.** `supersedes` agisce nell'ambito dell'errore (o dell'esecuzione); evidenza come insieme di righe senza duplicati. Non accolta l'identità dell'evidenza attraverso le congiunzioni nelle famiglie senza enumeratore: è il comportamento di oggi, dichiarato come limite noto (§3.2, §5). |
| 08      | alta    | Azioni, messaggi e bozza si rendono da un solo `finalContext`; confronto e tracking a livello di occorrenza                                 | **Accolto.** Ogni rilevazione porta il suo contesto e i campi di correlazione; accordo «esatto» solo con lo stesso requestId o trace id; tracking per errore (§3.1, §3.4, §3.7).                                                                                                                             |
| 09      | alta    | Parità con un caso solo anche con errori non riconosciuti; `UNKNOWN_CASE_CONTEXT` non porta stato; F1 non dichiara gli errori non esaminati | **Accolto.** Definita l'analisi completa; la parità vale solo lì; senza rilevazioni la copertura sta nell'output e nel riepilogo; copertura dichiarata anche in F1, con la nuova scelta D10 sul suo effetto (§3.4, §3.5, §6).                                                                                |
| 10      | media   | Il limite di 64 KiB della bozza serializzata non è governato                                                                                | **Accolto.** Misura a runtime sulla bozza serializzata in UTF-8, riserva e voci intere, anche nell'adattatore di completamento (§3.5).                                                                                                                                                                       |
| 11      | media   | Versione dell'output ripetuta nella cache; versione del report RTA non aggiornata                                                           | **Accolto, con una precisazione.** La versione entra già nell'impronta, quindi alzarla scarta la cache della v1. Si legge dalla costante esportata da go-runbook; il report RTA passa a `2.0.0` (§3.7).                                                                                                      |
| 12      | bassa   | D9 contraddice il §5                                                                                                                        | **Accolto.** D9 rimandata e descritta solo nel §5.                                                                                                                                                                                                                                                           |

## La v02

- Specifica: `SPEC-002-RunbookAllErrors-CLAUDE-v02.md`, SHA256
  `6bbf9b12f55dc609397c825d27e79330343fe79bf8df502d75972071e2fffe4d`.
- Cambia rispetto alla v01:
  - service e downstream entrano fra le famiglie con l'errore rappresentativo, quindi c'è una fase F4;
  - nuovi la copertura dell'analisi (`complete`, non esaminati, falliti), la divisione fra parte di finestra e parte
    per errore, il contesto per rilevazione, la misura a runtime della bozza, il lettore del tempo con aggregati;
  - D9 è rimandata; nuova D10.
  - Corretto il numero dei runbook API GW: sono 9.
- Stato: bozza, inviata al secondo giro di revisione.

## Secondo giro di revisione (Codex)

- Revisore: Codex CLI 0.170.0, sessione nuova `01a1f429-15ce-7711-8330-17cf7cfb5675`. Il runner non riprende una
  sessione su un percorso di piano diverso, e qui ogni versione è un file nuovo. Codex ha ricevuto le decisioni del
  primo giro come contesto. Piano rivisto: v02, SHA256 `6bbf9b12…e4d`.
- Esito: **REVISE**. Codex conferma che le decisioni SPEC002-01–12 sono recepite nella v02, compreso il limite
  dichiarato per SPEC002-07. Aggiunge 16 rilievi (10 alti, 6 medi).

| Rilievo | Gravità | Fase  | In breve                                                                                                            |
| ------- | ------- | ----- | ------------------------------------------------------------------------------------------------------------------- |
| 13      | alta    | F1    | API GW in F1: execution log e authorizer riscrivono metadati e conteggio della richiesta rappresentativa            |
| 14      | alta    | F1    | `supersedes` di Workday in F1, con ambito di esecuzione, cancella il trace A                                        |
| 15      | alta    | F2    | La sonda di versioning B2B dipende dalla traversata; gli hook di Stream leggono tutto l'access log                  |
| 16      | alta    | F2    | Lotto dell'execution log: limiti di 50 id e 1.000 righe, evidenza `unavailable` in `best-effort`                    |
| 17      | alta    | F3    | Saturazione Lambda multi-account per sorgente: oggi una sorgente satura lancia un errore                            |
| 18      | alta    | F4    | Un messaggio rappresentativo anche dentro lo stesso trace (SelfcarePG)                                              |
| 19      | alta    | F1    | Interop: aggregati ordinati per `count desc` prima del limite e CID saltati dal tracker non entrano nella copertura |
| 20      | media   | F1    | Interop BFF e tracker: gli oggetti derivati perdono il tempo                                                        |
| 21      | media   | F1    | Evidenza solo dai rami soddisfatti; la stessa riga vista da due query conta due volte                               |
| 22      | media   | F1    | Unità della copertura (righe, invocazioni, richieste) e interazione di D10 con la regola di stato                   |
| 23      | alta    | F2–F4 | Zero rilevazioni con iterazioni tutte fallite: classificazione e riepilogo verso Watchtower                         |
| 24      | media   | F1    | Bozza: la regola delle voci intere può omettere l'unica diagnosi                                                    |
| 25      | media   | F1    | Confronto con l'analisi umana: caso e identificatore devono concordare sulla stessa rilevazione                     |
| 26      | media   | F3    | requestId interpolati nelle query Lambda senza validazione né escaping comuni                                       |
| 27      | alta    | F2–F4 | Il blocco `perError` deve essere visibile alla raccolta degli step, al preflight dei servizi e alla policy cloud    |
| 28      | media   | F4    | Pipeline SEND autonome (SPID Hub, Logsaver) fuori dai builder service e downstream                                  |

- Decisioni sospese da Claude, che ha chiesto al committente come procedere: otto rilievi su sedici riguardano
  l'analisi per errore (F2–F4).
- Scelta del committente (19 novembre 2026): **tenere tutto in una v03** (F1–F4) e continuare la revisione con Codex.
- Decisioni di Claude sui rilievi 13–28: **tutti accolti**.
  - 13: in F1, riga attiva unica per parser, authorizer, execution log e hook; conteggio della scansione immutabile;
    variabili proprie per l'execution log (§3.4, §3.10).
  - 14: `supersedes` di Workday solo in F4; in F1 escono entrambi i casi (§3.7).
  - 15: viste per errore degli output di finestra (`scopedOutputs`); la sonda B2B è una lettura di finestra
    memorizzata, con la condizione valutata per errore dopo la traversata (§3.4).
  - 16: lotti dell'execution log dopo la scelta degli errori, al più 50 requestId, attribuzione per requestId esatto,
    saturazione e `unavailable` per richiesta (§3.3, §3.4).
  - 17: copertura per sorgente prima della fusione; niente più eccezione sulla saturazione (§3.3).
  - 18: per service e downstream l'unità è la riga d'errore; query del trace memorizzata per trace id (§3.4).
  - 19: meccanismo comune `StepCoverage`: saturazione delle query e degli aggregati, CID saltati (§3.3).
  - 20: il lettore del tempo riconosce gruppi e oggetti derivati; le trasformazioni conservano il tempo (§3.2, §3.7).
  - 21: evidenza solo dai rami soddisfatti; conteggio chiamato `evidenceRows`, mai «N volte» (§3.1, §3.2).
  - 22: unità di copertura per famiglia, `total` immutabile della scansione; D10 riguarda solo i non esaminati per fase
    (§3.5, §6).
  - 23: nuovo esito `inconclusive`, classificazione propria, copertura nel `RunbookCheck` e nel `resultSummary`
    (§3.5, §3.6, §3.8).
  - 24: ripiego della misura a runtime che conserva identificazione e copertura; controllo statico dello spazio minimo
    (§3.6).
  - 25: matcher per rilevazione; `MATCH_EXACT` solo con caso e identificatore concordi sulla stessa rilevazione
    (§3.8).
  - 26: modulo comune di validazione ed escaping degli identificatori (§3.4).
  - 27: `perError` espone enumeratore e blocco tramite `nestedSteps()`, visibili a preflight, policy cloud e digest
    (§3.4).
  - 28: SPID Hub e Logsaver in F4 con copertura di finestra; correlazione manuale dichiarata (§1.3, §3.3, §3.4).

## La v03

- Specifica: `SPEC-002-RunbookAllErrors-CLAUDE-v03.md`, SHA256
  `2e3a42b054768048f4a06c9534faf3b35ae7e6f9fbcb9c79ef508e8b57df80ae`.
- Cambia rispetto alla v02:
  - nuovi la copertura degli step (§3.3) e le viste per errore;
  - nuove le letture di finestra memorizzate, la visibilità del blocco per errore e l'esito `inconclusive`;
  - per service e downstream l'unità diventa la riga d'errore;
  - rivisti la valutazione dell'evidenza, la misura a runtime della bozza, il matcher e i test di famiglia;
  - i paragrafi del §3 sono rinumerati.
- Stato: bozza, inviata al terzo giro di revisione.

## Terzo giro di revisione (Codex)

- Revisore: Codex CLI 0.170.0, sessione nuova `01a1f434-64c2-74d3-ba59-8d91ea09a118`, con le decisioni dei primi due
  giri come contesto. Piano rivisto: v03, SHA256 `2e3a42b0…80ae`.
- Esito: **REVISE**. Codex conferma che la v03 recepisce le 16 decisioni del secondo giro. Aggiunge 11 rilievi (3
  alti, 8 medi).

| Rilievo | Gravità | In breve                                                                                                              | Decisione                                                                                                                                                                                                                           |
| ------- | ------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 29      | media   | In F1 la vista attiva è definita solo per API GW; Lambda deriva tutto dall'intera scansione                           | **Accolto.** In F1 ogni famiglia del §1.3 sceglie un errore attivo dalla scansione immutabile: riga per API GW, invocazione (sorgente e requestId) per Lambda, riga d'errore per service e downstream (§1.3, §3.10).                |
| 30      | alta    | Una lettura saltata per mancanza di identificatore restituisce zero righe e fa chiudere un caso di assenza            | **Accolto.** Una lettura saltata non è una lettura vuota: voce `skipped`, condizione di assenza non soddisfatta, nessuna chiusura (§1.4, §3.3, §3.4).                                                                               |
| 31      | alta    | Una seconda visita dello stesso step sostituisce l'output della prima; un fallimento successivo cancella una diagnosi | **Accolto.** Il contesto conserva gli output di tutte le visite per l'evidenza; i casi si valutano anche sul contesto parziale di un'iterazione fallita, e le rilevazioni positive restano, senza chiusura automatica (§3.2, §3.4). |
| 32      | media   | Multi-account: la copertura dipende dall'ordine delle sorgenti; un solo motivo per step                               | **Accolto.** Ogni sorgente si tenta indipendentemente; `StepResult.coverage` è un elenco con una voce per sorgente; account e autorizzazioni restano nel preflight (§3.3).                                                          |
| 33      | alta    | Hook di Stream e sonda B2B restituiscono successo su lettura fallita; saturazione misurata dopo un filtro             | **Accolto.** I due hook dichiarano `unavailable`; la saturazione si misura alla frontiera della query, sul risultato grezzo, e viaggia con le letture memorizzate (§3.3).                                                           |
| 34      | media   | Nello stesso trace, un timeout di un'altra chiamata si associa all'errore SelfcarePG                                  | **Respinto.** Attribuire l'evidenza alla singola chiamata (span, sequenza, endpoint) è macchinario nuovo per un caso limite. Diventa un limite dichiarato, con un test che fissa il comportamento (§3.4, §4, §5).                   |
| 35      | media   | Il BFF usa `exists` su gruppi `{ cid, logs }`; il tracker su gruppi `{ cid, rows }`                                   | **Accolto in parte.** Gli oggetti derivati dichiarano `supportingRows`, le righe che li sostengono (BFF). Per i gruppi del tracker vale l'intervallo del gruppo con peso 1, come approssimazione dichiarata (§3.2, §5).             |
| 36      | media   | Dal lato umano il testo di tutte le voci di tracking è unito; il matcher AI può promuovere un conflitto               | **Accolto.** Accordo esatto solo su una coppia: una rilevazione e una voce umana; il testo unito non basta; un conflitto sul solo identificatore resta conflitto anche nel matcher AI (§3.8, §4).                                   |
| 37      | media   | `errorDetails` composto può superare 5.000 caratteri; il dettaglio delle fonti non ha limite                          | **Accolto.** Budget proprio per `errorDetails`; righe di copertura compatte per motivo; `detail` limitato a 200 caratteri e solo nell'output strutturato; un'unica funzione di misura (§3.3, §3.6).                                 |
| 38      | media   | Completezza usata per decisioni incompatibili; D10 in conflitto con la parità a un caso                               | **Accolto.** Due domande distinte: evidenza completa (decide fra `unknown-case` e `inconclusive`) e chiusura automatica ammessa (stato e tipo). D10 tocca solo stato e tipo; le righe di copertura ci sono sempre (§3.5, §3.6, §6). |
| 39      | media   | Con la paginazione disattivata, `nextToken` si perde: una pagina sotto il limite sembra completa                      | **Accolto.** Satura anche una risposta con altre pagine non lette; il controllo `recordsMatched` di Logsaver resta (§1.4, §3.3).                                                                                                    |

## La v04

- Specifica: `SPEC-002-RunbookAllErrors-CLAUDE-v04.md`, SHA256
  `8c95ee109f41c36c0dcb43ac93f13a0b663d054cfda92f7a37518c71bfbe5c77`.
- Cambia rispetto alla v03:
  - copertura per sorgente, misurata alla frontiera della query;
  - letture saltate dichiarate;
  - visite ripetute conservate;
  - rilevazioni sui contesti parziali;
  - errore attivo in F1 per tutte le famiglie SEND;
  - evidenza completa separata dalla chiusura ammessa;
  - budget di `errorDetails`;
  - matcher a coppie;
  - `supportingRows`;
  - due limiti dichiarati in più.
- Stato: bozza, inviata al quarto giro di revisione.

## Quarto giro di revisione (Codex)

- Revisore: Codex CLI 0.170.0, sessione nuova `01a1f43c-ae85-7543-898a-75665b644119`, con le decisioni dei giri
  precedenti come contesto. Piano rivisto: v04, SHA256 `8c95ee10…5c77`.
- Esito: **REVISE**. Codex conferma che la v04 recepisce il terzo giro, compresi l'accoglimento parziale del 35 e il
  limite dichiarato al posto del 34. Aggiunge 10 rilievi (5 alti, 5 medi), **tutti accolti**:

| Rilievo | Gravità | In breve                                                                                           | Decisione (sezioni della v05)                                                                                                           |
| ------- | ------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 40      | alta    | Dopo una lettura saltata l'analizzatore pubblica comunque `LogCount = '0'`                         | L'esito della lettura arriva all'analizzatore; il conteggio si pubblica solo dopo una lettura riuscita e completa (§3.3, §4)            |
| 41      | media   | La fixture di Workday in F1 era incoerente con la riga attiva unica                                | Fixture con tempi espliciti: riga attiva A, riga unica con tre marcatori, sostituzione per riga in F4 (§4)                              |
| 42      | alta    | I validatori della costruzione non vedono gli step del blocco per errore                           | `wiredStepIds()` e `findUnwiredKnownCaseStepRef` riconoscono il blocco; id duplicati e `goTo` fra blocchi rifiutati (§3.4, §4)          |
| 43      | alta    | `QueryInteropPodContextStep` (sei runbook) e SPID Hub lanciano un errore sul limite di righe       | Le due eccezioni diventano voci `saturated`, con il controllo `recordsMatched` dove c'è; le righe restano (§3.3, §4)                    |
| 44      | media   | Il budget dei 64 KiB non governa la prosa                                                          | Byte residui controllati mentre si aggiungono voci; ultimo passo deterministico sui testi (§3.6, §4)                                    |
| 45      | alta    | Il segnale delle pagine non lette viene da `@pagopa/go-aws`, che non ha un changeset               | Changeset di `@pagopa/go-aws` nella release di F1, versione minima richiesta da go-runbook, verifica sul pacchetto (§3.9)               |
| 46      | alta    | L'execution log scarta le richieste senza `errorMessage` prima di guardare i requestId             | Criterio di lettura: requestId valido su errore ammesso; lettura omessa dichiarata `skipped`; fixture IO_EXP (§3.3, §4)                 |
| 47      | media   | Il tracking per errore non ha una mappatura sul contratto di completamento (64 voci, campi chiusi) | Mappatura sui campi esistenti, slot dell'id d'esecuzione riservato, scelta in ordine di tempo, correlazione completa nell'output (§3.8) |
| 48      | media   | Un risultato con una sorgente `unavailable` può entrare in cache                                   | Non entra in cache; la sorgente si rilegge alla ripresa (§3.8, §4)                                                                      |
| 49      | media   | Il `detail` di copertura può esporre nomi di profilo AWS locali nel report RTA                     | Stessa pulizia di `check.error` prima del report; `detail` ripulito e limitato (§3.3, §3.8, §4)                                         |

## La v05

- Specifica: `SPEC-002-RunbookAllErrors-CLAUDE-v05.md`, SHA256
  `4ccbe2ee434d9b99d0a7ccbac017d46abbfa2f961623558afa938e1d73c3532d`.
- Cambia rispetto alla v04 solo per i dieci rilievi del quarto giro.
- Stato: bozza, inviata al quinto e ultimo giro di revisione previsto.

## Quinto giro di revisione (Codex), ultimo previsto

- Revisore: Codex CLI 0.170.0, sessione nuova `01a1f443-036f-7c30-ad4c-6fba46e7cddb`, con le decisioni dei giri
  precedenti come contesto. Piano rivisto: v05, SHA256 `4ccbe2ee…532d`.
- Esito: **REVISE**. Codex conferma che la v05 recepisce i dieci rilievi del quarto giro. Aggiunge 7 rilievi (1 alto,
  6 medi). Codex ha letto anche il ramo `feature/runbook` di go-watchtower (`9167b9e`).
- Andamento dei rilievi alti per giro: 9, 10, 3, 5, 1.

| Rilievo | Gravità | In breve                                                                                                           | Posizione di Claude                                                                                                              |
| ------- | ------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 50      | alta    | Il corpo intero del callback (output e `resultSummary`) può superare il limite di 1 MiB di Watchtower              | Da accogliere: misurare la richiesta intera, limitare i messaggi resi, ridurre la diagnostica facoltativa in modo deterministico |
| 51      | media   | Watchtower conserva del tracking solo trace id e istante; scarta codice e dettaglio                                | Da accogliere come condizione di rilascio: una fixture callback → rilettura; la proiezione è lavoro di go-watchtower             |
| 52      | media   | Con una lettura satura sparisce `LogCount`, e cadono anche predicati positivi come la guardia BFF InfoPa           | Da accogliere: i predicati positivi leggono lo stato della lettura; solo le assenze richiedono una lettura completa              |
| 53      | media   | Un'iterazione fallita per una lettura non dichiara `unavailable` e il risultato può entrare in cache               | Da accogliere: nessuna scrittura in cache con iterazioni fallite                                                                 |
| 54      | media   | DailyExport usa nomi di profilo AWS locali come chiave di sorgente, che finirebbero in copertura e chiavi d'errore | Da accogliere: etichetta di sorgente sicura nei campi esportati; il nome del profilo resta interno all'instradamento             |
| 55      | media   | Le righe Lambda senza requestId raccolte in un solo errore ripristinano la logica di finestra                      | Da accogliere: ogni riga senza identificatore è un errore non attribuito a sé, contato a parte dalle invocazioni                 |
| 56      | media   | L'evidenza dichiarata dell'output non vede gli step del blocco per errore (campione dell'execution log)            | Da accogliere: evidenza dichiarata costruita per iterazione, con la chiave dell'errore                                           |

- Nessun rilievo richiede macchinario nuovo: sono regole e test in più sulle strutture già decise.
- Stato: **bozza v05, non approvata**. Raggiunto il limite di cinque giri. Claude ha chiesto al committente come
  procedere: una v06 con un sesto giro oltre il limite, oppure la v05 con i sette rilievi come vincoli dichiarati per
  lo sviluppo, senza l'approvazione di Codex.
- Scelta del committente (19 novembre 2026): **v06 e un sesto giro oltre il limite**. Se anche il sesto giro chiede
  modifiche, Claude si ferma e consegna i rilievi aperti.
- Decisioni di Claude: i sette rilievi sono **accolti** come indicato nella tabella.

## La v06

- Specifica: `SPEC-002-RunbookAllErrors-CLAUDE-v06.md`, SHA256
  `6509c03ff3aea3b700729521efb82ef6cc66999dbc71961d3ed5abbf13c8ae7c`.
- Cambia rispetto alla v05:
  - il corpo intero del callback ha un limite di misura, e ogni messaggio reso ha un tetto (50);
  - la condizione di rilascio callback → rilettura su go-watchtower (51);
  - lo stato della lettura (`LookupState`) è separato dal conteggio (52), e la regola si applica ovunque compariva la
    vecchia condizione;
  - nessuna scrittura in cache con iterazioni fallite (53);
  - etichette di sorgente sicure (54);
  - ogni riga Lambda non attribuita è un errore a sé (55);
  - evidenza dichiarata costruita per iterazione (56).
- Stato: bozza, inviata al sesto giro di revisione.

## Sesto giro di revisione (Codex), oltre il limite

- Revisore: Codex CLI 0.170.0, sessione nuova `01a1f462-0ca8-7ae1-9d54-bee86aee3876`, con le decisioni dei giri
  precedenti come contesto. Piano rivisto: v06, SHA256 `6509c03f…7c` (completo nella sezione della v06).
- Esito: **REVISE**. Codex conferma che la v06 recepisce i sette rilievi del quinto giro. Aggiunge 7 rilievi (3 alti,
  4 medi). Andamento dei rilievi alti per giro: 9, 10, 3, 5, 1, 3.

| Rilievo | Gravità | In breve                                                                                                                                                         | Posizione di Claude                                                                                                                                                                   |
| ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 57      | alta    | D10 (a) non è «il comportamento di oggi»: F1 sceglie la richiesta più vecchia, non la più grave. Un 500 chiudibile più vecchio può nascondere un 503 da lavorare | Da accogliere. Tocca una scelta del committente: D10 diventa obbligatoriamente (b) quando F1 lascia errori non esaminati, oppure F1 conserva la scelta per gravità. Proposta: D10 (b) |
| 58      | alta    | In F1, senza `resolve`, un timeout dell'authorizer seguito da una lettura di servizio fallita fa fallire l'esecuzione e perde la diagnosi                        | Da accogliere: la regola del contesto parziale vale per tutta l'esecuzione, non solo per le iterazioni; rilevazioni conservate, lettura `unavailable`, nessuna cache                  |
| 59      | alta    | Il riduttore del callback non tocca il testo grezzo del contesto (`lastErrorMsg` copiato due volte)                                                              | Da accogliere: forma compatta finale del callback con campi limitati in `analysisPayload` e `resultSummary`; testo grezzo rimovibile; output completo nell'artefatto                  |
| 60      | media   | Limiti di testo del tracking impliciti: Watchtower accetta `errorCode` ≤ 200 e `errorDetail` ≤ 2.048 nel callback, ≤ 2.000 in lettura                            | Da accogliere: 200 e 2.000 in entrambi i produttori, identificatori oltre 255 caratteri saltati                                                                                       |
| 61      | media   | Assenza valutata sull'ultima visita: fallback con righe, poi trace vuoto → `LogCount == '0'`                                                                     | Da accogliere: l'assenza si valuta su tutte le visite che portano evidenza per l'errore attivo                                                                                        |
| 62      | media   | `atLeast` solo per saturazione; `unexamined = total - 1` può dare −1; righe Lambda non attribuite fuori dal totale                                               | Da accogliere: limite inferiore per ogni enumerazione incompleta, contatori separati, non esaminati = osservati − selezionati                                                         |
| 63      | media   | Il contratto attuale di Watchtower non ha tracking umano tipizzato: nessun `MATCH_EXACT` è possibile                                                             | Da accogliere con la via più semplice: `MATCH_EXACT` escluso con il contratto attuale e dichiarato nel report RTA, finché Watchtower non espone tracking tipizzato                    |

- Nessun rilievo richiede macchinario nuovo. Il 57 riapre una scelta del committente (D10).
- Stato: **bozza v06, non approvata da Codex**. Come concordato, Claude si ferma dopo il sesto giro e consegna i rilievi
  aperti al committente. Le strade sono tre:
  - una v07 con i sette rilievi e un settimo giro;
  - una v07 con i sette rilievi, senza altra revisione, approvata direttamente dal committente;
  - restringere la specifica a F1, dove la revisione converge più in fretta, e rimandare F2–F4.
- Scelta del committente (19 novembre 2026): **procedere con un'altra revisione di Codex**. Claude scrive la v07 con
  i sette rilievi accolti e avvia il settimo giro.
- Su D10 (rilievo 57) Claude toglie l'opzione «senza effetto su stato e tipo», che il rilievo mostra non sicura. Resta
  aperta la scelta fra (b), la proposta scritta nella specifica, e (c), la scelta per gravità in F1.

## La v07

- Specifica: `SPEC-002-RunbookAllErrors-CLAUDE-v07.md`, SHA256
  `72ea5040b845f74f545c7ff69232fda88c6f22a65986b85215386d7092603a10`.
- Cambia rispetto alla v06:
  - D10 rivista; con la proposta (b) gli errori non esaminati impediscono la chiusura automatica (57);
  - regola del contesto parziale estesa a tutta l'esecuzione e all'errore attivo di F1 (58);
  - testi grezzi del contesto limitati e forma compatta finale del callback (59);
  - limiti di testo del tracking: 200, 2.000 e identificatori oltre 255 caratteri saltati (60);
  - assenza valutata su tutte le visite con `LogCountAllVisits` (61);
  - contatori `observed` / `lowerBound` / `selected` e due popolazioni Lambda (62);
  - `MATCH_EXACT` non emesso con il contratto attuale di Watchtower (63).
- Stato: bozza, inviata al settimo giro di revisione.

## Settimo giro di revisione (Codex)

- Revisore: Codex CLI 0.170.0, sessione nuova `01a1f472-babb-7df1-90a1-471fb0029e36`, con le decisioni dei giri
  precedenti come contesto. Piano rivisto: v07, SHA256 `72ea5040…3a10`.
- Esito: **REVISE**. Codex conferma che la v07 recepisce i sette rilievi del sesto giro. Aggiunge 5 rilievi (2 alti,
  3 medi). Andamento dei rilievi alti per giro: 9, 10, 3, 5, 1, 3, 2.

| Rilievo | Gravità | In breve                                                                                                                                                                                     | Posizione di Claude                                                                                                                                                                                               |
| ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 64      | alta    | API GW: le righe d'errore senza requestId utilizzabile spariscono da `observed`, e un 504 benigno più vecchio può chiudere                                                                   | Da accogliere: chiave sintetica per ogni riga senza identità, contata in selezione, copertura e regola di chiusura, come le righe Lambda non attribuite                                                           |
| 65      | alta    | Dentro una richiesta, i messaggi dei servizi restano scalari rappresentativi (`<prefisso>ErrorMsg`, il più lungo): un conflitto DynamoDB chiudibile può nascondere un errore SQS da lavorare | Da accogliere, ma costa: i predicati API GW che diagnosticano messaggi di servizio passano dalle variabili all'evidenza delle righe di tutte le visite. È una migrazione del catalogo API GW, non solo del motore |
| 66      | media   | La ricostruzione dell'invocazione Lambda cerca il requestId anche nel testo del messaggio: righe di un'altra invocazione possono entrare                                                     | Da accogliere: identità di ogni riga verificata sul requestId strutturato, il messaggio solo se il campo manca                                                                                                    |
| 67      | media   | Il tracker dei CID e Logsaver pubblicano le righe solo se tutte le letture riescono                                                                                                          | Da accogliere: risultati parziali per gli step con più letture, voce `unavailable` per quella fallita                                                                                                             |
| 68      | media   | La forma compatta promette un artefatto completo recuperabile, ma il worker non salva l'output da nessuna parte                                                                              | Da accogliere ridimensionando: la promessa si toglie da go-automation (il worker è destinato a sparire), e la conservazione dell'output completo diventa un requisito della Lambda in go-watchtower               |

- Stato: **bozza v07, non approvata da Codex**. Claude si ferma, come richiesto per questo giro, e consegna i rilievi
  aperti al committente.

## Il modello ad albero (scelte del committente)

- 19 novembre 2026: il committente ha chiesto di nuovo la spiegazione del problema, in italiano, e perché SEND è
  diverso da interop. Claude ha proposto di separare SEND in una specifica a parte.
- Il committente ha deciso di **restare in una specifica unica** e ha descritto il modello: «raccolgo tutti gli errori
  ad ogni livello; se al primo livello trovo A e B e B scende di livello, troverò C e D; se D può scendere arriverò a
  E». L'output atteso è: `A`, `B -> C`, `B -> D -> E`. Quindi ogni errore ha la sua catena.
- Sui cinque punti proposti da Claude:
  1. catene uguali unite con conteggio e intervallo: «ok»;
  2. nodi non riconosciuti e catene interrotte mostrati: «sì ottimo»;
  3. un caso appartiene al livello più profondo che guarda e legge gli antenati: «ok ottimo»;
  4. **«No, completed se almeno una catena arriva fino ad un caso noto chiudibile»**. Claude aveva proposto
     `COMPLETED` solo se ogni catena finisce in un caso chiudibile;
  5. **«Nessun limite per livello»**. Claude aveva proposto 20 nodi per livello.
- Rilievi aperti del settimo giro (64–68): il modello ad albero li recepisce.
  - 64: ogni riga senza identità è un nodo con chiave sintetica.
  - 65: ogni riga d'errore di un servizio è un nodo, quindi niente più messaggi rappresentativi.
  - 66: le righe si attribuiscono sull'identificatore strutturato.
  - 67: gli step con più letture pubblicano risultati parziali.
  - 68: la conservazione dell'output completo è un requisito della Lambda di go-watchtower.

## La v08

- Specifica: `SPEC-002-RunbookAllErrors-CLAUDE-v08.md`, SHA256
  `08f90f6e7c62bd20f0d7a1540488fb584da45ad93adf44fb5975be5902a9b2c3`.
- Riscritta attorno all'albero degli errori (§3.1–§3.6). Le regole dei sette giri restano, adattate ai nodi:
  - copertura, saturazione alla frontiera della query, letture saltate, visite ripetute;
  - identificatori, misura della bozza e del callback, tracking, cache, nomi di profilo;
  - `MATCH_EXACT` fuori dal contratto attuale, `@pagopa/go-aws`.
- Decisioni del committente registrate nel §6: D1, D5, D8, D11, D13, D14. D10 è superata da D5. Restano proposte D2,
  D3, D4, D6, D7 e D12.
- Stato: bozza, inviata all'ottavo giro di revisione.

## Ottavo giro di revisione (Codex), sul modello ad albero

- Revisore: Codex CLI 0.170.0, sessione nuova `01a1f5b3-6ae9-71f3-8187-bd60398de06b`. Piano rivisto: v08, SHA256
  `08f90f6e…b2c3`.
- Esito: **REVISE**, 11 rilievi (8 alti, 3 medi). Codex giudica l'albero realizzabile sul codice attuale. Chiede regole
  esplicite su tre punti: quando un nodo è pronto per la valutazione, quali righe può usare, e come finisce una discesa
  incompleta.

| Rilievo | Gravità | In breve                                                                                                                                                            | Posizione di Claude                                                                                                                                                                 |
| ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 69      | alta    | Il padre si valuta prima della lettura del livello figlio, quindi i casi d'assenza (504 B2B senza log in `pn-delivery`) e la sonda di versioning non vedono l'esito | Da accogliere: una fase «dopo la lettura» sul padre, in cui girano gli step e i casi che dipendono da stato e conteggio del figlio, anche con zero righe                            |
| 70      | alta    | Le sole righe d'errore non bastano: la traversata di NotificationReceived passa da una riga INFO, e un caso B2B richiede righe di successo oltre all'errore         | Da accogliere: righe di contesto correlate disponibili per l'instradamento e per i casi che le chiedono, senza diventare nodi                                                       |
| 71      | alta    | Un caso con `or` su due servizi raggiungibili per strade diverse (checkout di NotificationReceived) non ha un livello unico                                         | Da accogliere: un caso può dichiarare alternative per livello con la stessa identità pubblica, validate ciascuna sulla sua strada                                                   |
| 72      | alta    | Il secondo tentativo con il trace id trovato dal fallback UUID non è una discesa: è lo stesso livello                                                               | Da accogliere: secondo tentativo tipizzato e raggruppato allo stesso livello, righe unite per identità della riga                                                                   |
| 73      | alta    | In una lettura raggruppata satura, una richiesta può restare senza righe e chiudersi come foglia                                                                    | Da accogliere: copertura per identificatore richiesto; una discesa senza figli da una lettura incompleta è un'interruzione, non una foglia                                          |
| 74      | alta    | Le negazioni possono dedurre un'assenza da evidenza incompleta: `not(sequenceConfirmed)` porta il caso WAF a `COMPLETED`                                            | Da accogliere senza macchinario nuovo: uno step non pubblica un «falso» certo da evidenza incompleta ma `unknown`; il caso WAF richiede una conferma esplicita                      |
| 75      | alta    | In interop tutte le catene prendono il tempo della radice di finestra                                                                                               | Da accogliere: le catene di finestra prendono tempo e intervallo dall'evidenza del loro caso; senza tempo vanno in fondo                                                            |
| 76      | alta    | La forma compatta del callback non ha un limite garantito sul numero di gruppi; il worker attuale non conserva l'output                                             | Da accogliere: forma terminale limitata (anteprima dei gruppi e conteggi) e regola di conservazione per ogni produttore attivo, oppure ritiro del worker prima delle forme compatte |
| 77      | media   | Le catene stanno solo in `known-case-matched`                                                                                                                       | Da accogliere: le catene in un campo comune a tutti gli esiti                                                                                                                       |
| 78      | media   | Un gruppo ha un solo motivo e un solo `target` d'interruzione                                                                                                       | Da accogliere: riepilogo di tutte le interruzioni del gruppo; incompleto se lo è un membro                                                                                          |
| 79      | media   | Il tracking vuole il trace id, ma Lambda ha il requestId                                                                                                            | Da accogliere: identificatore tipizzato, prima TRACE_ID poi REQUEST_ID                                                                                                              |

- Stato: bozza v08. Claude ha consegnato i rilievi al committente per decidere se scrivere la v09 e fare il nono giro.
- Scelta del committente (19 novembre 2026): «si procedi». Claude scrive la v09 con gli undici rilievi e avvia il
  nono giro.

## La v09

- Specifica: `SPEC-002-RunbookAllErrors-CLAUDE-v09.md`, SHA256
  `57772328c15d367f5141b051359db857b1cb149c12ebb520cda6370d24b8d0bc`.
- Cambia rispetto alla v08:
  - quattro fasi per livello, con il nodo valutato dopo le sue discese e gli step `afterDescend` (69);
  - righe di contesto `steps.<id>.context` (70);
  - alternative per livello di un caso (71);
  - secondo tentativo allo stesso livello, con righe unite per identità (72);
  - copertura per identificatore, interruzione `incomplete` e definizione di foglia vera (73);
  - valori derivati con tre stati e condizioni esplicite (74);
  - tempo delle catene di finestra dall'evidenza del caso (75);
  - forma terminale limitata del callback, abilitata solo dove l'output si conserva (76);
  - `chains[]` comune a tutti gli esiti (77);
  - riepilogo delle interruzioni del gruppo (78);
  - identificatore tipizzato nel tracking (79).
- Stato: bozza, inviata al nono giro di revisione.

## Nono giro di revisione (Codex)

- Revisore: Codex CLI 0.170.0, sessione nuova `01a1f5da-7336-7782-b9e5-001a387f3af4`. Piano rivisto: v09, SHA256
  `57772328…d0bc`.
- Esito: **REVISE**, 7 rilievi (4 alti, 3 medi). Codex conferma che le undici decisioni dell'ottavo giro sono nella
  v09. Andamento dei rilievi alti sul modello ad albero: 8, 4.

| Rilievo | Gravità | In breve                                                                                                                                      | Posizione di Claude                                                                                                                                                              |
| ------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 80      | alta    | Solo i nodi d'errore possono scendere: NotificationReceived arriva a Checkout da una sola riga INFO di `pn-external-registries`, senza errori | Da accogliere: una lettura senza nodi d'errore può comunque far scendere il padre, se le righe di contesto indicano la strada; il figlio si attacca alla catena del padre        |
| 81      | alta    | Un caso InfoPa richiede due righe d'errore distinte dello stesso servizio (telemetria Selfcare fallita più timeout di retry)                  | Da accogliere: un caso può leggere come evidenza di supporto le altre righe d'errore dello stesso identificatore, ancorando la corrispondenza al nodo                            |
| 82      | alta    | L'attribuzione per identificatore strutturato scarta le righe trovate con il fallback UUID, che sta nel messaggio                             | Da accogliere: si attribuisce secondo il tipo d'identificatore della lettura; il trace id trovato serve al secondo tentativo, e la richiesta resta la stessa                     |
| 83      | alta    | Il caso B2B `delivery-external-registries-read-timeout` richiede l'assenza di tre diagnosi in tutta la lettura figlia e propone `COMPLETED`   | Da accogliere: l'esclusione si valuta sull'intera lettura figlia e si pubblica sul padre con tre stati (esclusione vista, lettura completa senza esclusione, lettura incompleta) |
| 84      | media   | Nomi di profilo AWS anche in `report.input.awsProfiles`, nell'input dell'output e nella telemetria                                            | Da accogliere: ripulitura ai confini d'esportazione (report e callback)                                                                                                          |
| 85      | media   | Il confronto con l'analisi umana vede solo 10 campioni per gruppo                                                                             | Da accogliere: confronto locale su tutti i membri; un identificatore non trovato nei soli campioni non è un conflitto                                                            |
| 86      | media   | Il tracking richiede un istante, e un'esecuzione in ritardo perde le voci nel confronto (finestra di 10 minuti da `firedAt`)                  | Da accogliere: l'istante osservato del membro scelto, con `firedAt` per le catene senza tempo                                                                                    |

- Stato: bozza v09. Claude ha consegnato i rilievi al committente.
- Scelta del committente (19 novembre 2026): «procedi». Claude scrive la v10 con i sette rilievi e avvia il decimo
  giro.

## La v10

- Specifica: `SPEC-002-RunbookAllErrors-CLAUDE-v10.md`, SHA256
  `67d2966ec302cb2659141cc11d6fa4a82b598672ea503a778ef01269f8e763af`.
- Cambia rispetto alla v09:
  - instradamento dalle righe di contesto anche senza nodi d'errore, con il passaggio visibile nella catena (80);
  - righe d'errore di supporto `steps.<id>.siblings` con corrispondenza ancorata al nodo (81);
  - attribuzione secondo il tipo d'identificatore della lettura, con il fallback UUID nel messaggio (82);
  - esclusioni sulla lettura figlia, pubblicate sul padre con tre stati (83);
  - ripulitura dei nomi di profilo ai confini d'esportazione (84);
  - confronto su tutti i membri del gruppo (`members`), con il campione mancante che non vale come conflitto (85);
  - istante del tracking dal tempo osservato, `firedAt` per le catene senza tempo (86).
- Stato: bozza, inviata al decimo giro di revisione.

## Decimo giro di revisione (Codex)

- Revisore: Codex CLI 0.170.0, sessione nuova `01a1f5e2-8f07-7ca1-8437-cec72740e57b`. Piano rivisto: v10, SHA256
  `67d2966e…63af`.
- Esito: **REVISE**, 6 rilievi (3 alti, 3 medi). Codex conferma che i rilievi 80–86 sono nella v10. Andamento dei
  rilievi alti sul modello ad albero: 8, 4, 3. Codex ha letto anche go-watchtower-pro: SPEC-041 v45 e SPEC-049 v15.

| Rilievo | Gravità | In breve                                                                                                                                                                                | Posizione di Claude                                                                                                                                                                          |
| ------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 87      | alta    | La Lambda sostitutiva (`wt-analyze-alarm` in go-watchtower-pro) non usa il callback di completamento: usa il flusso di proposta e risultato                                             | Da accogliere: adattatore dell'output 2.0.0 per quel flusso e condizione di rilascio su una fixture di quel flusso. La fixture del callback resta finché resta il worker attuale             |
| 88      | alta    | L'instradamento dalle righe di contesto vale solo senza nodi d'errore: un ERROR senza URL sullo stesso trace fa perdere la strada verso Checkout                                        | Da accogliere: una riga di contesto aggiunge una strada anche in presenza di nodi d'errore, se nessun ramo d'errore la copre già                                                             |
| 89      | alta    | Altri casi richiedono due righe d'errore distinte: B2B `external-registries-selfcare-retry-timeout` (che propone `COMPLETED`) e InfoPa `external-registries-response-already-committed` | Da accogliere, e da generalizzare: si migrano a «nodo più righe sorelle» **tutti** i casi con due o più predicati sulle righe dello stesso step dentro un `all(...)`, non solo quelli citati |
| 90      | media   | L'execution log attribuisce le righe cercando il requestId in tutto il messaggio                                                                                                        | Da accogliere: si usa il requestId del prefisso della riga di execution log                                                                                                                  |
| 91      | media   | Il confronto scarta le voci a più di 10 minuti da `firedAt`, mentre alcuni runbook leggono fino a 30 minuti prima                                                                       | Da accogliere: finestra del confronto pari alla finestra d'evidenza del runbook                                                                                                              |
| 92      | media   | La traccia d'esecuzione salvata dalla CLI contiene ancora i nomi dei profili                                                                                                            | Da accogliere: ripulitura anche della traccia salvata                                                                                                                                        |

- Proposta di Claude per chiudere la serie di rilievi sul catalogo: aggiungere una regola generale. **Tutte le
  fixture esistenti dei runbook passano invariate come regressioni dell'albero.** Ogni diagnosi attesa oggi resta, e
  ogni cambiamento si documenta caso per caso nel registro. Così i casi che la revisione statica non ha ancora
  incontrato sono coperti dai test.
- Stato: bozza v10. Claude ha consegnato i rilievi al committente.
- Scelta del committente (19 novembre 2026): «ok», cioè v11 con i sei rilievi e la regola di regressione.

## La v11

- Specifica: `SPEC-002-RunbookAllErrors-CLAUDE-v11.md`, SHA256
  `92cad27caaa2b0af02939225678b1ee9fcc104ff85d3a69045c3753250b0c488`.
- Fatti verificati da Claude in go-watchtower-pro il 19 novembre 2026:
  - `wt-analyze-alarm` scrive l'analisi con `run.propose` (SPEC-041 v45 §7, SPEC-049 v15);
  - la forma della proposta e gli esiti dei runbook li fisserà la specifica dell'analisi degli allarmi (SPEC-041 D28),
    ancora da scrivere;
  - SPEC-049 destina `go-watchtower-client` e `go-watchtower-runbook` a sparire.
- Cambia rispetto alla v10:
  - due produttori dell'analisi: il worker attuale, con il callback e la sua fixture, e il sostituto, con la
    proposta. Per il sostituto, go-runbook esporta composizione e misura, e la v11 fissa i requisiti e la condizione
    di rilascio per la specifica D28 (87);
  - instradamento dalle righe di contesto anche con nodi d'errore (88);
  - migrazione generale a «nodo più righe sorelle», con il controllo alla registrazione (89);
  - attribuzione dell'execution log sul prefisso della riga (90);
  - finestra del confronto pari alla finestra d'evidenza del runbook (91);
  - ripulitura della traccia salvata dalla CLI (92);
  - **regola di regressione**: tutte le fixture dei runbook passano invariate (§3.7, §4).
- Stato: bozza, inviata all'undicesimo giro di revisione.

## Undicesimo giro di revisione (Codex)

- Revisore: Codex CLI 0.170.0, sessione nuova `01a1f5eb-d23f-75b3-b588-083152695bc2`. Piano rivisto: v11, SHA256
  `92cad27c…c488`.
- Esito: **REVISE**, 6 rilievi (2 alti, 2 medi, 2 bassi). Codex conferma che i rilievi 87–92 e la regola di
  regressione sono nella v11. Andamento dei rilievi alti sul modello ad albero: 8, 4, 3, 2.

| Rilievo | Gravità | In breve                                                                                                                                                                  | Posizione di Claude                                                                                                                                                                                     |
| ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 93      | alta    | La discesa porta solo `target` e identificatore. Nello stesso lotto possono finire una ricerca per trace id e una per fallback UUID, che si attribuiscono in modo diverso | Da accogliere: il tipo d'identificatore viaggia con ogni discesa e si conserva nel lotto e nell'attribuzione; lotti separati per tipo, o predicati e attribuzione tipizzati                             |
| 94      | alta    | Una chiamata di go-aws può fare più query fisiche e fondere righe e statistiche; la saturazione di una query si perde nella fusione                                       | Da accogliere: completezza calcolata per query fisica prima della fusione e propagata a ogni identificatore coperto, anche senza righe                                                                  |
| 95      | media   | Nella variante Lambda multi-account il budget di 100 query è condiviso fra le sorgenti: una sorgente rumorosa lo esaurisce prima della seconda                            | Da accogliere: lotti iniziali garantiti a ogni sorgente, tentativi extra limitati a parte, lotti non letti dichiarati                                                                                   |
| 96      | media   | L'azione di un caso del figlio si rende dal contesto della radice, quindi `deliveryErrorMsg` risulta «non disponibile»                                                    | Da accogliere: si rende dal nodo che ha riconosciuto il caso, con i suoi antenati, nel membro più vecchio del gruppo                                                                                    |
| 97      | media   | Il worker attuale non ha un valore di esito per `inconclusive`: l'enum del contratto non lo prevede, e un valore nuovo farebbe rifiutare il callback                      | Da accogliere: mappatura su un valore esistente con comportamento di revisione definito, e fixture; oppure il worker si ritira prima del nuovo classificatore. Proposta: legarlo al ritiro di DRAFT-001 |
| 98      | bassa   | La guardia `TRAVERSAL_FINISHED` del fallback BFF di NotificationReceived legge un esito scritto più in basso nella traversata                                             | Da accogliere: l'esito del ramo concluso si pubblica sul nodo BFF nella fase dopo la discesa. La regola di regressione copre già la fixture                                                             |
| 99      | bassa   | I casi SPID Hub leggono conteggi scalari, quindi non hanno righe da cui prendere il tempo                                                                                 | Da accogliere: i casi si legano alle righe d'errore che producono i conteggi                                                                                                                            |

- Stato: bozza v11. Claude ha consegnato i rilievi al committente.
- Il committente ha chiesto che cosa sia «il worker». Claude ha spiegato la catena `go-execute-runbook` (coda SQS,
  Lambda, script, metodi di scrittura di `go-watchtower-client`, callback di completamento verso il vecchio Watchtower):
  - non è mai stata rilasciata in produzione;
  - ha già un sostituto progettato, `wt-analyze-alarm` in go-watchtower-pro;
  - molti vincoli degli ultimi giri esistono solo per lei.

  Claude ha proposto di ritirarla prima di F1.

- Scelta del committente (19 novembre 2026): **«si ritiriamolo»** (D15).

## La v12

- Specifica: `SPEC-002-RunbookAllErrors-CLAUDE-v12.md`, SHA256
  `d0a158bd7e72c0d6753a5fb2776a77545bed2e518b4e05ce48760e027c95ec27`.
- Cambia rispetto alla v11:
  - **F0, ritiro del worker** con la catena di DRAFT-001, prima di F1. L'unico produttore dell'analisi è
    `wt-analyze-alarm`;
  - spariscono le forme compatte e terminali del callback, la fixture sul vecchio Watchtower e l'enum degli esiti. Il
    rilievo 97 non ha più oggetto;
  - la forma e i limiti dell'analisi li fissa la specifica D28 di go-watchtower-pro. Fino ad allora valgono quelli della
    bozza di oggi (D4 rivista);
  - tipo d'identificatore su ogni discesa e lotti tipizzati (93);
  - completezza per query fisica in go-aws, propagata a ogni identificatore (94);
  - budget delle query per sorgente nella variante Lambda multi-account (95);
  - azioni rese dal nodo che riconosce il caso (96);
  - `branchOutcome` a ramo concluso per il fallback BFF (98);
  - casi SPID Hub legati alle righe (99).
- DRAFT-001 non si modifica: la sua promozione a specifica avviene con F0 di questa.
- Stato: bozza, inviata al dodicesimo giro di revisione.

## Dodicesimo giro di revisione (Codex)

- Revisore: Codex CLI 0.170.0, sessione nuova `01a1f5f8-7523-7810-bf28-40fb4805956b`. Piano rivisto: v12, SHA256
  `d0a158bd…ec27`.
- Esito: **REVISE**, 6 rilievi (1 alto, 4 medi, 1 basso). Codex conferma che la v12 recepisce i rilievi 93–96 e 98–99
  e che, con D15, il 97 non ha più oggetto. Andamento dei rilievi alti sul modello ad albero: 8, 4, 3, 2, 1.

| Rilievo | Gravità | In breve                                                                                                                                                               | Posizione di Claude                                                                                                                                                                                  |
| ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 100     | alta    | Logsaver: con letture parziali, il conteggio degli errori non spiegati può valere zero e il caso «solo interruzioni Spot» propone `COMPLETED`                          | Da accogliere: quel caso richiede la copertura completa di tutte le letture d'errore di Logsaver. La regola si estende a ogni condizione d'assenza su un contatore: vale solo con copertura completa |
| 101     | media   | go-aws butta via le righe già lette se una query fisica successiva o una pagina successiva fallisce                                                                    | Da accogliere: risultati parziali al confine di go-aws; pagine non lette al limite `saturated`, letture fallite `unavailable`; abort globale invariato                                               |
| 102     | media   | `branchOutcome` ha esiti che si sovrappongono e può dire `undiagnosed` su un ramo incompleto                                                                           | Da accogliere: esiti esclusivi con precedenza esplicita; `undiagnosed` solo con il ramo completo                                                                                                     |
| 103     | media   | Con un'enumerazione incompleta, un identificatore umano non trovato fra i membri non è un conflitto                                                                    | Da accogliere: con copertura incompleta l'esito è «evidenza insufficiente»                                                                                                                           |
| 104     | media   | F0 deve verificare se esiste un deploy non di produzione (stack SST, link OAM, coda, catalogo pubblicato) e smontarlo nell'ordine giusto prima di cancellare il codice | Da accogliere: verifica come prerequisito esplicito di F0, con l'ordine di smontaggio, oppure la registrazione che non c'è niente                                                                    |
| 105     | bassa   | Il passaggio «via pn-external-registries» non ha un campo nell'output                                                                                                  | Da accogliere: i passaggi intermedi come metadati della catena                                                                                                                                       |

- Stato: bozza v12. Claude ha consegnato i rilievi al committente.
- Risposta del committente sul 104 (19 novembre 2026): «no mai stato deployato al momento non serve niente tutta quella
  parte». F0 cancella solo codice e configurazione, senza smontaggi.

## La v13

- Specifica: `SPEC-002-RunbookAllErrors-CLAUDE-v13.md`, SHA256
  `0c9b2b6f6c9a75bda3b023c23b5ccd917deb5abff99f72eeb76c47015bcdd75a`.
- Cambia rispetto alla v12:
  - contatori di finestra con `<contatore>State`, e assenza solo con lettura completa (100);
  - risultati parziali in go-aws per query fisiche e pagine (101);
  - `branchOutcome` esclusivo con precedenza `diagnosed` → `incomplete` → `undiagnosed` (102);
  - «evidenza insufficiente» nel confronto con enumerazione incompleta (103);
  - F0 senza smontaggi, con la conferma del committente (104);
  - `routes` e `via` per i passaggi intermedi (105).
- Stato: bozza, inviata al tredicesimo giro di revisione.

## Tredicesimo giro di revisione (Codex)

- Revisore: Codex CLI 0.170.0, sessione nuova `01a1f5ff-7c9b-7333-a63d-99327b1d1fb1`. Piano rivisto: v13, SHA256
  `0c9b2b6f…d75a`.
- Esito: **REVISE**, 5 rilievi (0 alti, 4 medi, 1 basso). È il primo giro senza rilievi alti. Codex conferma che la
  v13 recepisce i rilievi 100–105. Andamento dei rilievi alti sul modello ad albero: 8, 4, 3, 2, 1, 0.

| Rilievo | Gravità | In breve                                                                                                                                                                                           | Posizione di Claude                                                                                                                                                               |
| ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 106     | media   | Una lettura parziale (prima pagina con un figlio riconosciuto, seconda fallita) lascia ambigui la catena, lo stato della lettura, `branchOutcome` e D5                                             | Da accogliere: i figli di una lettura parziale si enumerano e si valutano; la parte mancante segue il ramo come evidenza incompleta; `queried` solo con tutte le letture complete |
| 107     | media   | La ricerca dell'account e del profilo in go-aws si basa sulle eccezioni: trasformarle in «non disponibile» fermerebbe il tentativo dei candidati successivi e metterebbe in cache quello sbagliato | Da accogliere: i risultati parziali solo su richiesta dei runbook; prima si provano tutti i candidati, poi si dichiara `unavailable`; in cache solo il candidato che ha risposto  |
| 108     | media   | Il livello di un caso si deduce dagli step, ma molte condizioni leggono variabili (per esempio `externalRegistriesErrorMsg` di `appio-cosmos-429`) che il raccoglitore delle dipendenze ignora     | Da accogliere: ogni variabile ha il livello che la produce, dichiarato dallo step che la scrive; il builder lo usa per il livello del caso e per la validazione                   |
| 109     | media   | Gli aggregati interop con `latest(cidValue)` perdono gli altri CID: un CID umano assente non è un conflitto                                                                                        | Da accogliere: copertura degli identificatori distinta da quella della diagnosi; con aggregati che perdono identificatori, un identificatore assente è «evidenza insufficiente»   |
| 110     | bassa   | Il controllo dei package pubblicati forza i tarball candidati e non verifica la versione minima di go-aws dichiarata da go-runbook                                                                 | Da accogliere: controllo del range della dipendenza nel manifesto impacchettato                                                                                                   |

- Stato: bozza v13. Claude ha consegnato i rilievi al committente.
- Scelta del committente (19 novembre 2026): «procedi».

## La v14

- Specifica: `SPEC-002-RunbookAllErrors-CLAUDE-v14.md`, SHA256
  `8f0dc8dc92cc0284acf3d825e4980a60eac5be90e67bec6f2b5c55b869dd09da`.
- Cambia rispetto alla v13:
  - copertura di un padre combinata su query, pagine, tentativi e visite; i figli delle letture parziali proseguono, e
    `unavailable` come interruzione vale solo senza figli (106);
  - risultati parziali come opzione dei runbook, ricerca dei candidati invariata, cache solo con il candidato che ha
    risposto (107);
  - livello delle variabili dichiarato dagli step che le scrivono (108);
  - copertura degli identificatori distinta da quella della diagnosi negli aggregati (109);
  - controllo del range di go-aws nel manifesto impacchettato (110).
- Stato: bozza, inviata al quattordicesimo giro di revisione.

## Quattordicesimo giro di revisione (Codex)

- Revisore: Codex CLI 0.170.0, sessione nuova `01a1f606-2f10-7ef3-aa9b-5ab02c4439c7`. Piano rivisto: v14, SHA256
  `8f0dc8dc…09da`.
- Esito: **REVISE**, 5 rilievi, tutti medi, nessun alto: è il secondo giro di fila senza rilievi alti. Codex conferma
  che la v14 recepisce i rilievi 106–110.

| Rilievo | Gravità | In breve                                                                                                                                                                                      | Posizione di Claude                                                                                                                                                       |
| ------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 111     | media   | In service e downstream la lettura del trace restituisce anche la riga d'errore della radice, che diventerebbe un figlio «?»: un ANPR 404 da sola riga darebbe `404 → ?` e niente `COMPLETED` | Da accogliere: le righe degli antenati si escludono dai figli per identità della riga                                                                                     |
| 112     | media   | Con più discese da un nodo, una discesa fallita senza figli sparisce se un'altra discesa ha portato figli                                                                                     | Da accogliere: la regola dell'interruzione vale per ogni discesa richiesta, non per il padre nel suo insieme                                                              |
| 113     | media   | Nella variante Lambda multi-account la divisione di un lotto saturo **sostituisce** la lettura: se le due metà sono complete, la copertura è completa                                         | Da accogliere: si distingue il tentativo che sostituisce la stessa lettura (divisione) dalla visita che aggiunge evidenza; la saturazione iniziale resta nella telemetria |
| 114     | media   | In una catena di finestra interop, due righe dello stesso caso con CID e tempi diversi non entrano nel membro, che ha un solo tempo e una sola correlazione                                   | Da accogliere: osservazioni tipizzate (identificatore e tempo) dall'evidenza del caso, usate per tracking e confronto                                                     |
| 115     | media   | I nomi di profilo possono uscire anche dai testi d'errore dell'output (errori di esecuzione e recuperati)                                                                                     | Da accogliere: la ripulitura vale per tutto l'output esportato                                                                                                            |

- Stato: bozza v14. Claude ha consegnato i rilievi al committente.
- Scelta del committente (20 novembre 2026): **«a»**. Claude scrive la v15 con i cinque rilievi, e il committente la
  approva direttamente, **senza un altro giro di Codex**.
  - Claude registra questa scelta come deroga alla revisione indipendente: la v15 **non** è approvata da Codex.
  - L'ultimo esito di Codex è REVISE sulla v14, con cinque rilievi medi e nessun alto, tutti recepiti nella v15.
  - I dettagli di realizzazione che la revisione statica non ha incontrato li copre la regola di regressione del
    catalogo (§3.7, punto 0).

## La v15

- Specifica: `SPEC-002-RunbookAllErrors-CLAUDE-v15.md`, SHA256
  `5ed6a810ef4b129ac8f79099f3a4d39518ba2b431be82e1ac0183da668ce3bed`.
- Cambia rispetto alla v14:
  - righe degli antenati escluse dai figli (111);
  - interruzione per ogni discesa richiesta (112);
  - divisione dei lotti Lambda come sostituzione della lettura (113);
  - osservazioni tipizzate degli identificatori nelle catene di finestra (114);
  - ripulitura dei nomi di profilo su tutto l'output esportato (115);
  - intestazione riscritta.
- Stato: in attesa dell'approvazione esplicita del committente sulla v15.

## Le scelte del committente sulle proposte aperte (20 novembre 2026)

- Il committente ha chiesto di riproporre le scelte non confermate «una alla volta», con le possibilità e il
  contesto. Claude ha presentato D2, D3, D4, D6, D7 e D12, ciascuna con tre o quattro opzioni.
- Risposte:

| Scelta                      | Risposta | Significato                                                                                                                                    |
| --------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| D2 · Risoluzione anticipata | (a)      | `resolve` si toglie del tutto                                                                                                                  |
| D3 · Sovrapposizioni        | (a)      | `supersedes` sul caso, valido sul singolo nodo                                                                                                 |
| D4 · Forma dell'analisi     | (c)      | catene come testo subito, forma strutturata già esposta da go-runbook, campo strutturato in Watchtower come evoluzione nella specifica D28     |
| D6 · Azioni                 | (a)      | una volta per caso per gruppo                                                                                                                  |
| D7 · Casi senza tempo       | (a)      | in fondo, in ordine di dichiarazione                                                                                                           |
| D12 · Tipo dell'analisi     | (a)      | `IGNORABLE` solo se tutte le catene sono ignorabili con lo stesso motivo. Claude ha verificato che oggi nessun caso del catalogo è `IGNORABLE` |

## La v16

- Specifica: `SPEC-002-RunbookAllErrors-CLAUDE-v16.md`, SHA256
  `fb4903e4c7c5bed028185344f7f9b0ce22eed2b575236fa43d81915a909c8741`.
- Cambia rispetto alla v15: le sei scelte sono segnate come decise nel §6; il testo di D4 è allineato alla scelta (c)
  nel §3.6, nei requisiti per la specifica D28 (§3.9) e nel §5. Il contenuto tecnico è invariato.
- Tutte le scelte del §6 sono decise, tranne D9, rimandata, e D10, superata da D5.
- Stato: in attesa dell'approvazione esplicita del committente sulla v16. Non è approvata da Codex, per scelta del
  committente.

## L'approvazione

- 20 novembre 2026: il committente approva la v16 («approvata»), SHA256 `fb4903e4…8741`. Non è approvata da Codex,
  per scelta del committente.
- Il committente chiede di iniziare lo sviluppo con la skill `typescript-expert`. Al termine di tutto lo sviluppo, Codex
  ispeziona tutto il codice prodotto.

## Sviluppo

### F0 · Ritiro del worker (20 novembre 2026)

- Stato di partenza (prima di ogni modifica): build, test, lint, unused, dependencies, duplicates, types e scaffold
  verdi. `format` fallisce solo su `docs/specs/SPEC-003-DispatchPaperRequestId/…-v01.md`, file di un'altra specifica
  in corso nello stesso checkout, che Claude non tocca.
- Eliminati: `functions/go-ExecuteRunbookLambda`, `scripts/go/go-execute-runbook`, `infra/watchtower-alarm-analysis`,
  `packages/go-execute-runbook-contracts`, `bins/deploy-execute-runbook-environment`. Da
  `contracts/runbook-automation/v1` sono eliminati il manifest di go-automation, gli schemi del catalogo e del
  registro delle code, `fixtures/` e `owned/`. `upstream/go-watchtower` resta, perché è vendorizzato da Watchtower.
- `go-watchtower-client`:
  - restano solo le letture;
  - eliminati i metodi del ciclo di vita, le esecuzioni automatiche, l'avvio e l'anteprima da CLI e
    `parseAutomaticAlarmAnalysisCommandV1`;
  - eliminati i tipi relativi e le dipendenze `ajv` e `ajv-formats`;
  - test riscritti sulle letture: normalizzazione dell'URL, rinnovo del token sul 401.
- Configurazione:
  - `package.json`: tolti `build:ts` del bin, gli script `deploy:execute-runbook*`, `diff:execute-runbook` e
    `catalog:automatic:build-local`, e le devDependencies `@aws-sdk/client-lambda`, `client-secrets-manager` e
    `client-sts`;
  - tolti i riferimenti da `tsconfig.json`, `knip.config.ts` (anche `infra/*`) ed `eslint.config.mjs`;
  - `pnpm-workspace.yaml`: tolti `infra/*` e le voci di catalogo `ajv-formats` e `sst`.
- README fuori da `docs/` aggiornati: `infra`, `go-runbook`, `go-watchtower-client`, `create-runbook`, due Lambda e il
  template delle issue. I documenti di `docs/` si aggiornano nel passaggio di documentazione di F1.
- Verifica: build, test, lint, unused, dependencies, duplicates, types e scaffold verdi; `format` come allo stato di
  partenza. Nessun riferimento residuo alla catena fuori da `docs/`.

### F1 · Motore, copertura, output, interop, catalogo (20 novembre 2026)

**Motore** (`packages/go-runbook/src/engine`):

- `KnownCase.priority` e `DUPLICATE_CASE_PRIORITY` tolti; `supersedes` con i controlli `UNKNOWN_SUPERSEDED_CASE` e
  `SUPERSEDES_CYCLE` (sé stesso compreso). `'resolve'` tolto da `FlowDirective` e da tutti gli step che lo emettevano.
- `detections` al posto di `matchedCases`: tempo dall'evidenza (`EvidenceTimeReaderFn`, iniettato; il toolkit usa
  `readEvidenceTime`), indici d'evidenza solo dai rami soddisfatti, visite ripetute concatenate, ordine per tempo con
  pari merito e casi senza tempo in ordine di dichiarazione. L'azione di ogni rilevazione si esegue, in ordine.
- Fallimento dopo evidenza: l'esecuzione resta `completed` con voce `unavailable`. «Evidenza» vuol dire che una lettura
  (step `data`) è già riuscita: gli step di contesto non bastano.
- `StepResult.coverage` e `observedErrors`; traccia `2.0.0` con `coverage`, `supersededBy` e i tempi per caso.
- Il nome del lettore del tempo è `EvidenceTimeReaderFn`, non `EvidenceTimeReader`: la regola ESLint sui tipi funzione
  chiede il suffisso.

**Copertura**:

- go-aws: `rowsReturned` e `unreadPages` per query fisica; opzione `partialResults` con `failedReads`. L'annullamento e
  gli errori di configurazione del target (`OAM_REGION_MISMATCH`, `INVALID_OAM_TARGET`) lanciano ancora. La cache della
  risoluzione si aggiorna già solo sul candidato che ha risposto.
- Toolkit: `executeCloudWatchLogsQuery` attiva `partialResults` e restituisce la copertura (`queryCoverage`: righe al
  limite dell'ultimo `limit` o 10.000, pagine non lette, letture fallite). Se nessuna lettura risponde rilancia
  l'errore: così la lettura del livello 0 che fallisce fa ancora fallire l'esecuzione. Tutti gli step che leggono con
  l'adattatore inoltrano la copertura.
- Errori senza eccezione diventati voci: execution log in modalità `best-effort`, hook di Stream, sonda B2B.
- `withScrubbedErrors` ripulisce anche i `failedReads`.

**Output e bozza**: output `2.0.0` (`chains`, `coverage`, `inconclusive`), `RunbookCheck` con `INCONCLUSIVE` e
`incompleteSources`, bozza secondo D5, D7 e D12 con `fitAnalysisDraft`. Nuove funzioni condivise da bozza e console:
`buildCoverageLines`, `buildErrorChains`, `renderErrorChainLines`.

**Interop**: query aggregate con `earliest(@timestamp) as firstTimestamp` e `sort latestTimestamp desc`; BFF con il
tempo delle righe e `supportingRows`; tracker dei CID con letture indipendenti, CID oltre il limite `saturated` e
`TrackerState`; contesto del pod troncato come voce `saturated` con le righe lette; `sequenceConfirmed` a tre stati.

**SEND in F1**: una catena sola, scelta come oggi. `ParseApiGwErrorsStep` (richieste), `ParseLambdaErrorsStep`
(invocazioni distinte) e `AnalyzeApplicationLogsStep` (righe d'errore) dichiarano gli errori osservati e non esaminati.

**Consumatori**: go-analyze-alarm stampa le catene e la copertura e salva traccia e output senza nomi di profilo
(`scrubAwsProfileNamesDeep`); go-rta-check mostra tutti i casi, conta `INCONCLUSIVE` e scrive i report ripuliti;
go-watchtower-runbook confronta ogni caso rilevato e tiene il migliore, non emette `MATCH_EXACT`, non mette in cache
le esecuzioni con evidenza non disponibile, legge la versione dell'output dalla costante, report `2.0.0`.

**Diagnosi cambiate** (regola di regressione del §3.7), una per una:

| Runbook                                                  | Prima                                       | Dopo                                                                             | Motivo                              |
| -------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------- |
| interop Selfcare 1.0, ID Selfcare noto e ignoto insieme  | primo l'ignoto                              | entrambi, in ordine di dichiarazione                                             | due errori distinti                 |
| interop Selfcare 1.0, IAM e ID noto                      | primo IAM                                   | entrambi                                                                         | due errori distinti                 |
| interop BFF, reset di purpose-process                    | purpose-process primo, AgreementApi secondo | solo purpose-process                                                             | stesso errore: `supersedes`         |
| interop delegation writer e archiver                     | crash primo                                 | crash, connessione e coordinator, in ordine di dichiarazione (righe senza tempo) | tre errori distinti                 |
| interop notification consumer, duplicato più caso aperto | `IN_PROGRESS`                               | `COMPLETED`, note con entrambi                                                   | D5                                  |
| interop platformstate, contesto del pod illeggibile      | `failed`                                    | `completed`, caso letto negli errori, voce `unavailable`                         | §3.3/§3.4                           |
| interop contesto del pod troncato                        | step fallito                                | righe lette e voce `saturated`                                                   | §3.4; nessun caso legge il contesto |
| interop auth-server, WAF timeout                         | permesso anche senza sequenza               | richiede `false` esplicito o conferma                                            | §3.2, valore a tre stati            |
| interop auth-server, fallback non verificato             | `not(true)`                                 | `false` o `unknown`                                                              | §3.2                                |
| Lambda authorizer API key, insert-trigger                | timeout specifico prima del generico        | solo lo specifico                                                                | `supersedes: ['lambda-timeout']`    |
| SEND NotificationReceived, timeout checkout              | solo checkout                               | checkout più i due timeout del BFF della stessa richiesta                        | catena B → C del §2                 |
| SEND NotificationReceived, lettura checkout fallita      | `failed`                                    | `completed`, nessun caso, voce `unavailable` (`inconclusive`)                    | §3.3                                |
| SEND (generico, IO_EXP, Stream), caso noto a monte       | la discesa si fermava                       | la discesa prosegue verso il servizio a valle                                    | niente `resolve`                    |
| SEND, gate dell'authorizer                               | `resolve`                                   | `stop`: il backend non è stato chiamato                                          | foglia vera                         |
| SelfcarePG, external-registries IO, Postel               | caso noto senza trace                       | il trace si legge comunque                                                       | niente `resolve`                    |

**Deviazioni da F1 come scritta**:

- Il motore ad albero per livelli (fasi, discesa raggruppata, nodi, `routes`, `members`, `samples`) non è in F1: le
  catene sono di finestra, una per rilevazione, ed è quanto serve a interop e al SEND a catena sola. L'albero entra
  in F2, con il suo primo uso. Restano per F2 anche il limite di 4.000 caratteri dei testi copiati nel contesto e il
  controllo alla registrazione che ogni query d'evidenza proietti il tempo.
- go-watchtower-runbook confronta per caso rilevato, non per gruppo e membri: il package è destinato a sparire e il
  confronto per membri ha senso solo con i gruppi dell'albero.
- Workday `duplicated-event-400-02` (`supersedes`) resta per F4, come la copertura di SPID Hub e Logsaver e il budget
  multi-account (F3).

**Documentazione**: `docs/RUNBOOKENGINE.md` (motore, esempio didattico, traccia e output `2.0.0`), `docs/ARCHITECTURE.md`,
`docs/TESTING_STRATEGY.md`, `docs/AWS_LOGICAL_ACCOUNTS.md` (anche i riferimenti residui di F0) e i README di
`go-runbook`, `go-analyze-alarm` e `go-rta-check`. Restano da rifare a mano i due SVG di `docs/images` sulla
architettura cloud, che mostrano ancora il worker ritirato e che nessun documento corrente cita.

**Rilascio**: changeset `major` per `@pagopa/go-runbook` e `minor` per `@pagopa/go-aws`; baseline e report delle API
rigenerati.

**Verifica**: build, test, lint, published, unused, dependencies, duplicates, types e scaffold verdi; `format` come
allo stato di partenza (solo il file di SPEC-003). `new-classes` non eseguito: legge la base da git.

### Ispezione Codex di F0 e F1 · primo giro (20 novembre 2026)

Il committente sceglie di far ispezionare F0 e F1 prima di F2. Il diff completo rispetto a `5a7f6758` supera il
limite d'ingresso di Codex, perché F0 cancella molto codice. Codex riceve quindi un ordine d'ispezione con l'ambito,
le deviazioni registrate e l'elenco dei 306 file, e li legge da sé in sola lettura. Esito: **REVISE**, 14 finding,
tutti accolti.

| Id    | Sev.   | Finding                                                                                                                                                                | Correzione                                                                                                                                                  |
| ----- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1-01 | high   | il fallback audit interop deduce la completezza dal solo numero di righe: una lettura satura per pagine non lette dà `false` e il WAF timeout può proporre `COMPLETED` | `RunbookContext.coverage` e `isStepEvidenceComplete`; lo step legge la completezza delle letture applicative, aggregate e del tracker; tolta `TrackerState` |
| F1-02 | medium | `supersedes` toglie il caso da tutta la finestra anche se letto su un'altra riga                                                                                       | si toglie solo l'evidenza coperta; il caso resta, con tempo e righe ricalcolati, se ha evidenza propria                                                     |
| F1-03 | medium | un `nextToken` ripetuto butta le pagine già lette                                                                                                                      | con `partialResults` si ferma e tiene le pagine, `unreadPages: 'failed'`                                                                                    |
| F1-04 | medium | trace non letto per identificatore mancante senza copertura `skipped`                                                                                                  | `skipped` nello step del trace (se c'erano errori) e nella lettura dei servizi API Gateway                                                                  |
| F1-05 | medium | gli identificatori prendono il primo tempo del gruppo                                                                                                                  | `TimedEvidenceIdentifier`: ogni identificatore ha il suo istante; negli aggregati quello di `latest(...)`                                                   |
| F1-06 | medium | la bozza misura il testo grezzo invece del JSON, e può restituire una bozza fuori limite                                                                               | misura JSON, riserva copertura e inizio della prima voce, accorcia le liste solo se serve, verifica finale con errore esplicito                             |
| F1-07 | medium | la registrazione non controlla le 64 voci per lista nell'unione dei casi                                                                                               | controllo di `resources` e `downstreams` nell'unione; `links` e `finalActions` limitati nella bozza                                                         |
| F1-08 | medium | lo scrub usa le voci grezze (`reader:fallback`) e non i nomi effettivi; dettagli troncati a metà nome                                                                  | nomi grezzi più effettivi; campi `profile`, `profiles`, `awsProfiles` mascherati per intero; dettagli troncati a confine di parola                          |
| F1-09 | medium | il confronto RTA usa ±10 minuti invece della finestra d'evidenza del runbook                                                                                           | finestra da `startTime`/`endTime` dell'output; ±10 minuti solo se mancano                                                                                   |
| F1-10 | medium | il matcher dà a ogni caso gli stessi identificatori globali; l'AI confronta il miscuglio dei casi                                                                      | identificatori per caso dalle osservazioni della sua catena; l'AI confronta il caso migliore                                                                |
| F1-11 | medium | un abort durante le azioni non produce un esito `aborted`                                                                                                              | il ciclo delle azioni si ferma sull'abort e l'esecuzione finisce `aborted`                                                                                  |
| F1-12 | medium | il fallimento parziale vale anche per le procedure                                                                                                                     | vale solo per `alarm-resolution`; le procedure falliscono come prima                                                                                        |
| F1-13 | medium | gli errori osservati contano righe, non richieste, e non segnano il limite inferiore                                                                                   | richieste per requestId distinto; `lowerBound` quando la lettura è incompleta (anche Lambda e servizi)                                                      |
| F1-14 | low    | due tipi nuovi in `ConditionEvaluator.ts`; adattatore delle query senza JSDoc                                                                                          | `EvidenceIndices`, `ElementPredicate`, `ExecutedCloudWatchLogsQuery` in file propri; JSDoc                                                                  |

Verifica dopo le correzioni: build, test, lint, published, unused, dependencies, duplicates, types e scaffold verdi;
`format` come allo stato di partenza. Baseline e report delle API rigenerati.

### Ispezione Codex di F0 e F1 · secondo giro (20 novembre 2026)

Esito: **REVISE**, 14 finding (2 high), tutti accolti.

| Id       | Sev.   | Finding                                                                                 | Correzione                                                                                                                                               |
| -------- | ------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1-R2-01 | high   | il ramo `false` del WAF ignora la completezza degli aggregati API Gateway               | `false` richiede anche la lettura completa degli aggregati; altrimenti `unknown`                                                                         |
| F1-R2-02 | high   | un caso d'assenza (`LogCount == 0`) scatta su una lettura saltata e propone `COMPLETED` | `<prefix>LookupState` (`queried`, `saturated`, `unavailable`, `skipped`) da `readStepLookupState`; le sei condizioni d'assenza SEND richiedono `queried` |
| F1-R2-03 | medium | il caso residuo dopo `supersedes` resta anche se la sua condizione non vale più         | il caso si rivaluta sul contesto senza le righe coperte; resta solo se vale ancora                                                                       |
| F1-R2-04 | medium | identificatori senza tempo persi                                                        | `EvidenceTime` con limiti opzionali: osservazioni senza istante, in fondo                                                                                |
| F1-R2-05 | medium | l'involucro conta sempre `errorDetails`                                                 | conta solo se la bozza ha dettagli; nota vuota con voci = errore                                                                                         |
| F1-R2-06 | medium | `arrayItems` non applicato a `resources`/`downstreams`                                  | verifica contro il limite passato                                                                                                                        |
| F1-R2-07 | medium | lo scrub cambia valori di macchina uguali a un nome di profilo                          | un valore che è solo un nome si lascia; i campi profilo si mascherano per nome di chiave                                                                 |
| F1-R2-08 | medium | un caso senza osservazioni prende in prestito gli identificatori globali                | identificatori del contesto solo se nessuna catena ha osservazioni                                                                                       |
| F1-R2-09 | medium | l'AI confronta il caso migliore con l'estratto più vicino all'allarme                   | si usa la voce di tracking con gli identificatori del caso, se c'è                                                                                       |
| F1-R2-10 | medium | voci di cache prodotte con la semantica del primo giro                                  | `CACHE_FINGERPRINT_VERSION` 7                                                                                                                            |
| F1-R2-11 | medium | le procedure accettano letture parziali                                                 | una procedura fallisce se uno step perde una lettura (`unavailable`)                                                                                     |
| F1-R2-12 | medium | abort durante la valutazione dei casi                                                   | l'esecuzione finisce `aborted`                                                                                                                           |
| F1-R2-13 | medium | `examined: 1` anche quando gli execution log esaminano più richieste                    | lo step degli execution log ridichiara gli errori osservati con le richieste lette                                                                       |
| F0-R2-01 | low    | commento sul worker ritirato in `analysisDraftBounds.ts`                                | aggiornato                                                                                                                                               |

Verifica: build, test, lint, published, unused, dependencies, duplicates, types e scaffold verdi; `format` come allo
stato di partenza.

### Ispezione Codex di F0 e F1 · terzo giro (20 novembre 2026)

Esito: **REVISE**, 9 finding medium, nessun high; tutti accolti.

| Id       | Finding                                                                                    | Correzione                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| F1-R3-01 | due casi che sostituiscono lo stesso caso su righe diverse: il secondo ripristina il primo | le righe coperte si uniscono e il caso si rivaluta una volta sola senza tutte                                                      |
| F1-R3-02 | abort che non lancia durante la valutazione dell'ultimo caso                               | il controllo dell'abort dopo la valutazione porta all'esito `aborted`                                                              |
| F1-R3-03 | procedure: pagine non lette accettate, `continueOnFailure` scavalcato                      | per una procedura ogni lettura incompleta è un fallimento dello step, gestito dal percorso ordinario. Il catalogo non ha procedure |
| F1-R3-04 | la sonda B2B scrive `queried` anche su una lettura satura                                  | stato `saturated` quando la query ha copertura incompleta                                                                          |
| F1-R3-05 | richieste esaminate = richieste interrogate                                                | richieste con righe d'execution log attribuite                                                                                     |
| F1-R3-06 | un identificatore senza tempo in un gruppo prende il tempo del gruppo                      | senza `at` l'identificatore è senza tempo                                                                                          |
| F1-R3-07 | i dettagli opzionali possono rendere impossibile una bozza fattibile                       | secondo tentativo senza `errorDetails`                                                                                             |
| F1-R3-08 | lo scrub altera i timestamp e lascia un nome esatto nel testo libero                       | campi per significato: profilo mascherato, campi di macchina e timestamp invariati, il resto è testo libero                        |
| F1-R3-09 | l'estratto nel report non è quello confrontato dall'AI                                     | il report mostra il testo umano confrontato                                                                                        |

Verifica: build, test, lint, published, unused, dependencies, duplicates, types e scaffold verdi; `format` come allo
stato di partenza.

### Ispezione Codex di F0 e F1 · quarto giro (20 novembre 2026)

Esito: **REVISE**, 8 finding medium; tutti accolti.

| Id          | Finding                                                                                                                   | Correzione                                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1-R4-01    | `reason` esente dallo scrub lascia uscire il profilo in `outcome.reason`; testo libero che inizia con un timestamp esente | tolto `reason` dai campi di macchina; esente solo un valore che è per intero un timestamp                                                                                                                                  |
| F1-R4-02    | `steps.<id>` e `steps.<id>.output` contati come array diversi nella sostituzione                                          | riferimenti canonici prima dell'unione                                                                                                                                                                                     |
| F1-R4-03/04 | la regola delle procedure fa fallire letture volutamente limitate e scrive output parziali prima di fallire               | tolta la regola: `RunbookContext.readPolicy` (`partial` per `alarm-resolution`, `strict` altrimenti); l'adattatore chiede i risultati parziali solo con `partial`, e le procedure tornano alla semantica rigorosa di prima |
| F1-R4-05    | richieste esaminate = solo quelle degli execution log                                                                     | unione con la richiesta seguita dall'attraversamento (`apiGwExaminedRequestId`)                                                                                                                                            |
| F1-R4-06    | il marcatore delle voci omesse può prendere il posto della prima diagnosi                                                 | la nota deve cominciare con la prima diagnosi; altrimenti si accorciano prima `links` e `finalActions`                                                                                                                     |
| F1-R4-07    | i gruppi annidati assegnano il tempo del gruppo a un identificatore senza tempo                                           | gli identificatori attraversano le combinazioni senza cambiare istante                                                                                                                                                     |
| F1-R4-08    | voci di cache prodotte con la sonda B2B precedente                                                                        | `CACHE_FINGERPRINT_VERSION` 8                                                                                                                                                                                              |

Verifica: build, test, lint, published, unused, dependencies, duplicates, types e scaffold verdi; `format` come allo
stato di partenza.

### Ispezione Codex di F0 e F1 · quinto giro (20 novembre 2026)

Esito: **REVISE**, 4 finding medium; tutti accolti.

| Id       | Finding                                                                                      | Correzione                                                                     |
| -------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| F1-R5-01 | lo scrub sostituisce il valore enum `reason` della copertura se un profilo ha lo stesso nome | i valori enum di `reason` si conservano; ogni altro `reason` è testo libero    |
| F1-R5-02 | `steps.<id>.output.output` (proprietà reale `output`) tolto due volte nella sostituzione     | i riferimenti canonici si applicano senza un secondo taglio                    |
| F1-R5-03 | una riga d'execution log di A che cita B attribuita a B                                      | decide il prefisso `(<requestId>)`; senza prefisso si cerca l'id nel messaggio |
| F1-R5-04 | errori senza requestId: execution log non letti senza copertura `skipped`                    | copertura `skipped`                                                            |

Verifica: build, test, lint, published, unused, dependencies, duplicates, types e scaffold verdi; `format` come allo
stato di partenza.

**Stato dopo il quinto giro.** 49 finding accolti e corretti. Il committente chiede di continuare fino a zero
finding e poi di procedere con F2–F4.

### Ispezione Codex di F0 e F1 · sesto giro (20 novembre 2026)

Esito: **REVISE**, 4 finding medium e 1 low; tutti accolti.

| Id       | Sev.   | Finding                                                                   | Correzione                                                                                                       |
| -------- | ------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| F1-R6-01 | medium | una riga di un'altra richiesta che cita un id cercato resta nell'evidenza | le righe con prefisso di una richiesta non cercata si escludono dall'output; la copertura misura la query fisica |
| F1-R6-02 | medium | errori ammissibili senza requestId scartati in silenzio se altri ne hanno | voce `skipped` con il loro numero, anche quando la query parte                                                   |
| F1-R6-03 | medium | l'esenzione enum di `reason` vale anche per l'`outcome.reason` libero     | esenzione solo nelle voci di copertura e nelle interruzioni                                                      |
| F1-R6-04 | medium | voci di cache prodotte prima della copertura `skipped`                    | `CACHE_FINGERPRINT_VERSION` 9                                                                                    |
| F1-R6-05 | low    | timestamp di Logs Insights con lo spazio trattati come testo              | un valore che è per intero un timestamp, con `T` o spazio, resta invariato                                       |

Diagnosi cambiata: IO_EXP non usa più le righe di una richiesta non cercata (`(unrequested-id) …`) come evidenza di
`authorizer-configuration-error`.

Verifica: build, test, lint, published, unused, dependencies, duplicates, types e scaffold verdi; `format` come allo
stato di partenza.

### Ispezione Codex di F0 e F1 · settimo giro (20 novembre 2026)

Esito: **REVISE**, 1 finding medium e 1 low; accolti.

| Id       | Sev.   | Finding                                                                                                                                                                      | Correzione                                           |
| -------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| F1-R7-01 | medium | lo step degli execution log sovrascrive i campi dell'access log della richiesta selezionata con quelli della prima riga della sua ricerca: il contesto mescola due richieste | scrive solo i campi che il parser non ha già scritto |
| F1-R7-02 | low    | se la ricerca fallisce, gli errori senza requestId perdono la loro voce `skipped`                                                                                            | la voce si aggiunge anche al risultato `unavailable` |

Verifica: build, test, lint, published, unused, dependencies, duplicates, types e scaffold verdi; `format` come allo
stato di partenza.

### Ispezione Codex di F0 e F1 · ottavo giro (20 novembre 2026)

Esito: **REVISE**, 2 finding medium; accolti.

| Id       | Finding                                                                                                       | Correzione                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1-R8-01 | il filtro del settimo giro lascia riempire i campi assenti della richiesta selezionata con quelli di un'altra | i campi della richiesta selezionata sono un unico record: se il parser ha selezionato una richiesta, lo step degli execution log non scrive nessun campo dell'access log |
| F1-R8-02 | voci di cache con la diagnosi errata del settimo giro                                                         | `CACHE_FINGERPRINT_VERSION` 10                                                                                                                                           |

Verifica: build, test, lint, published, unused, dependencies, duplicates, types e scaffold verdi; `format` come allo
stato di partenza.

### Ispezione Codex di F0 e F1 · nono giro (20 novembre 2026)

Esito: **REVISE**, 1 finding medium; accolto.

| Id       | Finding                                                                                                  | Correzione                                                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1-R9-01 | il gate dell'authorizer ferma la catena per il fallimento di una richiesta diversa da quella selezionata | il gate diagnostica ogni fallimento, ma ferma la catena solo se fallisce la richiesta selezionata dal parser (per requestId, o per trace id se manca); `CACHE_FINGERPRINT_VERSION` 11 |

Verifica: build, test, lint, published, unused, dependencies, duplicates, types e scaffold verdi; `format` come allo
stato di partenza.

### Ispezione Codex di F0 e F1 · decimo giro (20 novembre 2026)

Esito: **REVISE**, 3 finding medium e 1 low sul gate dell'authorizer; accolti. Hanno tutti la stessa radice: in F1
la catena SEND unica condivide le variabili fra richieste diverse, e il contesto isolato per nodo arriva con
l'albero di F2. Le correzioni restano mirate.

| Id        | Sev.   | Finding                                                                                                   | Correzione                                                                                                                                                   |
| --------- | ------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1-R10-01 | medium | il gate ritrova la riga selezionata dal requestId, ma `-` o un trace condiviso la confondono con un'altra | il parser pubblica la posizione esatta della riga selezionata (`apiGwExaminedRowIndex`) e il gate usa quella; il requestId `-` non è più usabile             |
| F1-R10-02 | medium | la fermata e la diagnosi pubblicata possono venire da righe diverse                                       | quando la richiesta selezionata fallisce, il gate pubblica il suo fallimento; altrimenti diagnostica il primo fallimento di un'altra richiesta senza fermare |
| F1-R10-03 | medium | il dettaglio dell'authorizer in `lastErrorMsg` viene sovrascritto dall'attraversamento                    | `apiGwAuthorizerDetail` per i casi authorizer; `lastErrorMsg` solo quando la catena si ferma                                                                 |
| F1-R10-04 | low    | la richiesta diagnosticata dal gate non conta fra quelle esaminate                                        | `apiGwAuthorizerDiagnosedRequestId` entra nell'unione; `CACHE_FINGERPRINT_VERSION` 12                                                                        |

Verifica: build, test, lint, published, unused, dependencies, duplicates, types e scaffold verdi; `format` come allo
stato di partenza.

### Ispezione Codex di F0 e F1 · undicesimo giro (20 novembre 2026)

Esito: **REVISE**, 1 finding low; accolto.

| Id        | Finding                                                                                                                  | Correzione                                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1-R11-01 | la richiesta diagnosticata dal gate conta fra le esaminate solo se gli execution log rispondono, e si perde se non ha id | `declareExaminedRequests`: identità per requestId o per posizione della riga (`row:<n>`); il gate dichiara le richieste esaminate quando diagnostica, gli execution log aggiungono le loro; `CACHE_FINGERPRINT_VERSION` 13 |

Verifica: build, test, lint, published, unused, dependencies, duplicates, types e scaffold verdi; `format` come allo
stato di partenza.

### Ispezione Codex di F0 e F1 · dodicesimo giro (20 novembre 2026)

Esito: **APPROVED**, nessun finding. Codex verifica la correzione di F1-R11-01 e non trova difetti residui nei
percorsi ispezionati.

**Chiusura dell'ispezione di F0 e F1**: dodici giri, 64 finding accolti e corretti (3 high, tutti nei primi due giri),
gate verde. Si procede con F2.

## F2 · SEND API Gateway a livelli (20 novembre 2026)

**Motore.** `Runbook.tree` (`ErrorTreeDefinition`: un livello radice e un livello per bersaglio), costruito con
`RunbookBuilder.errorTree`. L'esecutore (`ErrorTreeExecutor`):

- enumera i nodi radice dal contesto della finestra; ogni nodo esegue gli step del suo livello in un contesto isolato,
  che vede le variabili degli antenati ma non le loro righe;
- raggruppa le discese per livello e tipo d'identificatore, una lettura per lotto (50 di default), e divide le righe fra
  i padri per identificatore esatto; una lettura di un solo identificatore restituisce per costruzione solo le sue righe;
- pubblica sul padre `<prefisso>LookupState`, `<prefisso>LogCount`, `<prefisso>LogCountAllVisits` e
  `<prefisso>Exclusion.<nome>`; secondo tentativo allo stesso livello con unione per identità della riga; righe degli
  antenati escluse; anti-ciclo per `(bersaglio, tipo, identificatore)` e profondità massima 32;
- instrada dalle righe di contesto con un pseudo-nodo su cui girano gli step del livello (stessa decisione e stessi
  hook dei nodi d'errore); le sue discese vanno al padre, `via` il livello letto;
- valuta i nodi dal più profondo: step `afterDescend`, `branchOutcome`, poi i casi del livello.

Catene raggruppate per `(bersaglio, casi)`, fine e motivo; azioni una volta per gruppo dal nodo che riconosce il caso;
fallback sul contesto dell'ultimo nodo della catena più vecchia. `ErrorChainGroup` ha `routes`, `samples` (al più 10)
e `members`. L'evidenza dichiarata si costruisce per nodo, con la chiave del nodo. `resolvedMessage` è limitato a 4.000
caratteri, come i testi d'errore copiati nel contesto dai nodi.

**SEND API Gateway.** Finestra: access log ed execution log. Radice: una richiesta per nodo (chiave sintetica senza
request id), con parse, authorizer, eventuale stop terminale, hook `before-service-traversal` e discesa al servizio
d'ingresso. Un livello per servizio: lettura raggruppata per trace id o fallback UUID, un nodo per riga d'errore,
righe sorelle e di contesto, hook `after-entry-analysis` sui nodi del servizio d'ingresso, discesa verso l'URL noto
della riga. Nuova ancora `after-entry-read` sulla radice, dopo la lettura del servizio d'ingresso (sonda B2B).
Ritirati `AnalyzeTraversedServiceLogsStep`, `DecideNextStep`, il riepilogo per catena unica e le variabili della
richiesta selezionata di F1.

**Deviazioni dalla specifica, motivate.**

| Punto della specifica                                       | Scelta                                                                                                                                    | Motivo                                                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `alternatives` per livello (§3.2)                           | un caso che legge più livelli si valuta su ciascuno: nel nodo di uno i passi dell'altro sono assenti, quindi un `or` è già un'alternativa | stesso risultato senza nuova API; i casi del catalogo non si riscrivono                                         |
| livello delle variabili «dichiarate da ogni step» (§3.2)    | il livello dichiara le variabili dei suoi nodi (`ownsVar`); quelle pubblicate dalla discesa non decidono il livello                       | le variabili della discesa vivono sul padre, che può stare a livelli diversi                                    |
| rifiuto dei casi su due livelli di catene diverse (§3.2)    | non applicato                                                                                                                             | senza dichiarazione dei padri i livelli non sono ordinabili; un `all` su due rami semplicemente non corrisponde |
| controllo «ogni query di evidenza proietta il tempo» (§3.7) | test sul catalogo (`evidenceQueriesProjectTime`) su ogni passo letto dai casi, letture di livello comprese                                | gira in CI su tutte le registrazioni                                                                            |
| execution log a lotti (§3.5)                                | resta una lettura di finestra per tutte le richieste, a lotti entro `maxRequestIds`, divisa fra i nodi dal prefisso della riga            | una lettura sola per finestra, invece di una per nodo                                                           |
| sonda di versioning B2B memorizzata (§3.5)                  | `RunbookContext.sharedReads`, creato per esecuzione e condiviso dai nodi; la copertura si dichiara una volta                              | stato per esecuzione, passato nel contesto                                                                      |

**Diagnosi cambiate** (regola di regressione del §3.7):

| Runbook                                         | Prima                                                         | Dopo                                                                                            | Motivo                                              |
| ----------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| NotificationReceived, checkout raggiunto        | timeout di checkout e i due sintomi BFF                       | solo il timeout di checkout; il BFF ha `branchOutcome` `diagnosed`                              | §3.1: il sintomo BFF richiede un ramo `undiagnosed` |
| NotificationReceived, INFO verso Delivery       | ignorata                                                      | letta come strada della richiesta, senza errori                                                 | §3.1, instradamento dalle righe di contesto         |
| IO_EXP, INFO verso Data Vault prima dell'F24    | ignorata                                                      | letta come strada della richiesta, senza errori                                                 | §3.1                                                |
| IO_EXP, righe d'execution log senza request id  | `authorizer-configuration-error`                              | `authorizer-access-log-failure`: le righe senza request id non appartengono a nessuna richiesta | §3.4, attribuzione per identificatore esatto        |
| InfoPa, timeout BFF con causa a valle           | timeout BFF in coda al caso Selfcare                          | solo il caso Selfcare; il sintomo BFF richiede ramo letto e `undiagnosed`                       | §3.1 e §3.2                                         |
| InfoPa ed execution log                         | interrogato solo con `errorMessage`                           | interrogato per ogni richiesta con request id                                                   | §3.5                                                |
| B2B, timeout Delivery verso external registries | `not(...)` sulle righe di external registries                 | esclusione `externalRegistriesExclusion.specificDiagnosis` `absent`                             | §3.2, esclusioni                                    |
| B2B, sonda di versioning                        | con `deliveryLogCount` zero                                   | anche con `deliveryLookupState` `queried`                                                       | §3.2, assenza solo su lettura completa              |
| B2B Data Vault, connessione interrotta          | tre predicati sulle righe dello stesso passo                  | errore dal nodo, successo e completamento anche dalle righe di contesto                         | §3.2                                                |
| InfoPa, tre casi su più righe                   | predicati sulle righe di BFF e di external registries insieme | BFF letto dalla variabile `bffErrorMsg` dell'antenato, firme ancorate al nodo con le sorelle    | §3.1, contesto isolato; §3.2, righe sorelle         |
| B2B, Selfcare su più righe                      | due predicati sulla stessa lettura                            | ancorati al nodo, il secondo anche dalle sorelle                                                | §3.2                                                |

Gate: build, test, lint, format (salvo il file di SPEC-003 di un'altra sessione), unused, dependencies, duplicates,
types, scaffold, published verdi; baseline e API report rigenerati.

**Aperto prima del rilascio**: la misura del costo con `go-rta-check` su occorrenze reali (§3.10), in sola lettura,
richiede le credenziali AWS del committente.

## F3 · Lambda a livelli (20 novembre 2026)

- Finestra: scansione degli errori e ricostruzione delle invocazioni per tutti i request id, 25 per query
  (`{{REQUEST_ID_FILTER}}` nel modello della query; un lotto fallito è `unavailable`, gli altri restano).
- Radice: un nodo per invocazione (sorgente e request id, strutturato prima del messaggio; senza request id valido un
  nodo a sé). Per nodo: classificazione, analisi del flusso, hook `before-downstream-queries`, discesa al downstream.
- Un livello per downstream con log group, letto a lotti per request id; un nodo per riga d'errore.
- Multi-account: i lotti iniziali di ogni sorgente si leggono sempre; le divisioni dei lotti saturi hanno un budget a
  parte (100) e sostituiscono la lettura satura; una metà incompleta conserva le righe della lettura iniziale per le
  sue invocazioni; scansione o invocazione oltre il limite e budget esaurito diventano copertura `saturated` invece di
  un errore. Un request id non valido rende la riga un'invocazione a sé invece di far fallire lo step.
- Ritirati `QueryDownstreamLogsStep` e `renderLambdaFinalSummary`: le catene dicono come è finita ogni invocazione.

Diagnosi cambiate: nessuna fixture del catalogo cambia diagnosi. Cambiano i test dei limiti multi-account (§3.4:
copertura invece di errore) e il conteggio degli step per invocazione.

Gate verde: build, test, lint, unused, published.

## F4 · SEND service e downstream a livelli, SPID Hub, Logsaver (20 novembre 2026)

- Famiglia service (15 runbook SEND, downstream compresi): radice con un nodo per riga d'errore (messaggio, trace id,
  fallback UUID per riga; le altre righe della scansione sono sorelle); livello `<servizio>-trace` letto a lotti di
  50 trace id (`@message like` ripetuto in `OR`), un nodo per riga d'errore del trace, esclusa la riga della radice.
  Nuova ancora `after-service-scan` per gli step di finestra (verifica dei batch Postel); `after-service-analysis` gira
  su ogni errore. Ritirati `AnalyzeApplicationLogsStep` e `QueryServiceTraceLogsStep`.
- Il livello di un caso comprende la radice quando la condizione legge un passo della finestra o della radice.
- Output: campi, messaggi risolti e risoluzioni della bozza si rendono dal contesto del nodo che riconosce il caso
  (`detectionContext`) o della catena più vecchia (`representativeContext`), non dal contesto finale della finestra.
- Workday: `duplicated-event-400-02` sostituisce `duplicated-event-err-cons` sul nodo.
- SPID Hub: il limite di righe è copertura `saturated` della lettura; la correlazione ALB manuale è una voce
  `manual`; i due casi si legano alle righe d'errore da cui vengono i contatori.
- Logsaver: ogni lettura è indipendente (fallita `unavailable`, troncata `saturated`), con
  `logsaverUnaccountedErrorLogCountState`; il caso «solo interruzioni Spot» (`COMPLETED`) lo richiede `complete`.

**Diagnosi cambiate**

| Runbook                     | Prima                                 | Dopo                                                              | Motivo                                    |
| --------------------------- | ------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------- |
| mandate, dati NIS mancanti  | audit e trace letti insieme           | audit dalla variabile del nodo radice, trace ancorato al nodo     | §3.1 contesto isolato, §3.2 righe sorelle |
| SPID Hub senza caso         | `unknown-case`                        | `inconclusive`: la correlazione ALB è manuale                     | §3.4                                      |
| SPID Hub e Logsaver saturi  | esecuzione fallita                    | completata, righe lette e copertura                               | §3.4                                      |
| Logsaver, lettura troncata  | esecuzione fallita                    | completata, contatore `incomplete`, nessun caso chiudibile        | §3.2 contatori                            |
| service, più righe d'errore | trace della prima, errore più recente | un nodo e un trace per riga; l'output rappresenta la prima catena | §3.5                                      |

Gate verde: build, test, lint, unused, published, format (salvo SPEC-003); baseline e API report rigenerati.

### Ispezione Codex finale di F2–F4 · primo giro (20 novembre 2026)

Esito: **REVISE**, 17 finding (4 high, 13 medium). Tutti accolti.

| Finding                                                  | Correzione                                                                                                                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F234-01 high, bozza dalle sole detection                 | la bozza legge le catene: `COMPLETED` solo con una foglia vera riconosciuta da un caso chiudibile, `IGNORABLE` solo se tutte le catene finiscono in casi ignorabili, una voce per caso e gruppo                           |
| F234-02 high, letture multi-account che si propagano     | ogni lettura (sorgente, lotto, metà) fallita è `unavailable`; errore solo se nessuna risponde; annullamento ed errori di configurazione restano eccezioni                                                                 |
| F234-03 high, identificatori non validati                | trace id, fallback UUID e request id si validano prima di discendere o di entrare in un predicato; un valore non valido è un identificatore mancante                                                                      |
| F234-04 high, righe sorelle copiate per nodo             | le sorelle sono un solo array condiviso dai nodi della stessa lettura                                                                                                                                                     |
| F234-05, righe d'execution log per sottostringa          | attribuzione solo per prefisso `(<requestId>)`                                                                                                                                                                            |
| F234-06, una sola strada dalle righe di contesto         | un pseudo-nodo per ogni target distinto; le strade già coperte si scartano dopo averle raccolte. Il profilo SEND di default legge i soli errori per scelta: l'instradamento vale dove la query legge le righe di contesto |
| F234-07, attribuzione per sottostringa                   | token esatti: FALLBACK-UUID e trace id del messaggio (`messageTraceIds`)                                                                                                                                                  |
| F234-08, discesa saltata senza copertura                 | voce `skipped` per livello; la copertura di un lotto dice quanti identificatori riguarda                                                                                                                                  |
| F234-09, letture dello stesso padre sovrascritte         | stato peggiore, righe sommate, esclusione `present` se vista in una qualunque lettura                                                                                                                                     |
| F234-10, righe informative come errori downstream Lambda | errore solo per livello o parola chiave d'errore                                                                                                                                                                          |
| F234-11, SPID Hub perde la lettura riuscita              | letture indipendenti, `unavailable` per quella fallita                                                                                                                                                                    |
| F234-12, `continueOnFailure` nel nodo e `getTraceInfo`   | il nodo con uno step fallito è «analisi fallita»; i metadati di traccia non fanno fallire lo step                                                                                                                         |
| F234-13, tempo della catena                              | la catena ha il tempo della radice; un caso letto da variabili prende il tempo del suo nodo                                                                                                                               |
| F234-14, telemetria contata due volte o persa            | la sonda condivisa dichiara la telemetria una volta; i lotti dell'execution log si uniscono                                                                                                                               |
| F234-15, identificatori di un'altra occorrenza           | ogni detection dell'output ha le sue `observations` (evidenza, correlazione del nodo e degli antenati); go-watchtower-runbook usa quelle                                                                                  |
| F234-16, firma BFF oltre il limite di 4.000 caratteri    | il nodo BFF pubblica `bffReadTimeout`, calcolato sulla riga intera                                                                                                                                                        |
| F234-17, id duplicati nei livelli                        | si controllano gli step dichiarati dal livello, non quelli che isola                                                                                                                                                      |

Cambiamenti di diagnosi conseguenti: un errore service senza trace id è una foglia (esempio ANPR del §3.5), quindi il
caso del delayer resta `COMPLETED`; il cancello `exists externalRegistriesTraceLogCount` dei casi SelfcarePA era un
residuo della catena unica e si toglie; nei casi PNPG letti da variabili l'ordine fra i casi della stessa richiesta segue
il tempo della richiesta.

### Ispezione Codex finale di F2–F4 · secondo giro (20 novembre 2026)

Esito: **REVISE**, 12 finding medium, nessun high; i 17 del primo giro risultano chiusi. Tutti accolti.

| Finding                                               | Correzione                                                                                                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F234-18, header X-Ray con suffisso                    | la discesa e la correlazione usano il trace id canonico, senza gli altri campi dell'header                                                                                  |
| F234-19, request id Lambda malformato                 | la discesa downstream lo tratta come mancante: solo quell'invocazione è `skipped`                                                                                           |
| F234-20, due chiamate allo stesso servizio            | un pseudo-nodo per target e fallback UUID                                                                                                                                   |
| F234-21, FALLBACK-UUID prefisso di un token           | il pattern richiede la fine del token                                                                                                                                       |
| F234-22, stato delle letture ereditato dagli antenati | accumulatore per nodo e livello, separato dalle variabili ereditate                                                                                                         |
| F234-23, riga attiva fra le sorelle                   | `.siblings` esclude le righe del nodo; nella radice service le sorelle sono gli errori dello stesso trace                                                                   |
| F234-24, note della bozza per caso                    | una voce per gruppo di catene, con la catena e le risoluzioni dalla foglia; un gruppo con un solo caso riconosciuto resta nella forma storica                               |
| F234-25, copertura dell'albero                        | `coverage.levels` e `coverage.interruptions`; l'evidenza non è completa con una catena interrotta (anche per ciclo); la lettura fallita dice quanti identificatori riguarda |
| F234-26, saturazione che nasconde una pagina fallita  | le voci `unavailable` restano accanto alla saturazione                                                                                                                      |
| F234-27, discese dei rami `IfBranch`/`SwitchBranch`   | la sottopipeline propaga discese e copertura                                                                                                                                |
| F234-28, cache RTA della revisione precedente         | versione del fingerprint della cache a 14                                                                                                                                   |
| F234-29, costo D×N dell'output                        | indice dei nodi per risultato, costruito una volta                                                                                                                          |

### Ispezione Codex finale di F2–F4 · terzo giro (20 novembre 2026)

Esito: **REVISE**, 7 finding (1 high, 6 medium). Tutti accolti.

| Finding                                           | Correzione                                                                                                                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F234-30 high, trace id in forma compatta          | il lettore dei servizi SEND cerca ogni trace id nella forma X-Ray e in quella compatta a 32 cifre (`traceIdForms`)                                                           |
| F234-31, strade dopo un secondo tentativo         | lo pseudo-nodo d'instradamento porta il trace id rivelato dalla lettura per fallback UUID                                                                                    |
| F234-32, strada senza identificatore scartata     | resta, e finisce `skipped` invece di lasciare una foglia completa                                                                                                            |
| F234-33, discesa ciclica fuori dall'accumulatore  | il ciclo entra nell'accumulatore come lettura incompleta                                                                                                                     |
| F234-34, `coverage.levels` senza limite inferiore | i livelli comprendono i bersagli richiesti senza nodi, con `lowerBound` per una lettura incompleta                                                                           |
| F234-35, forma storica e passaggi `via`           | la forma storica vale solo per una catena completa con un nodo riconosciuto; le righe di copertura riportano le catene interrotte; le catene mostrano i servizi attraversati |
| F234-36, caratteri di controllo nelle etichette   | le etichette dei log si rendono come una riga stampabile                                                                                                                     |

### Ispezione Codex finale di F2–F4 · quarto giro (20 novembre 2026)

Esito: **REVISE**, 6 finding medium. Tutti accolti.

| Finding                                              | Correzione                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| F234-37, Postel con scansione satura                 | `postelAllBatchesWorked` vale `true` solo con la scansione completa, altrimenti `unknown`                       |
| F234-38, forma compatta nel trace service/downstream | anche il lettore del trace service cerca le due forme del trace id                                              |
| F234-39, trace del secondo tentativo perso           | l'enumeratore riceve l'identificatore del secondo tentativo; nodi e pseudo-nodi senza trace proprio lo usano    |
| F234-40, rotte diverse nello stesso gruppo           | una rotta per tutto il gruppo si mostra in linea; più rotte si elencano con i conteggi, la diretta compresa     |
| F234-41, forma storica con evidenza parziale         | la forma storica richiede anche copertura completa ed evidenza della catena completa                            |
| F234-42, fallimento tardivo del padre                | il nodo fallito chiude la sua catena come `failed`, e i rami già indagati sotto di lui restano con le loro fini |

### Ispezione Codex finale di F2–F4 · quinto giro (20 novembre 2026)

Esito: **REVISE**, 4 finding medium. Tutti accolti.

| Finding                                                 | Correzione                                                                                                                                                                                                                                                             |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F234-43, righe POSTEL senza batch                       | le righe senza `batch_id` si contano (`postelUnverifiedRowCount`); con almeno una, `postelAllBatchesWorked` è `unknown`                                                                                                                                                |
| F234-44, predicato ampio con un solo identificatore     | i lettori per trace id scartano le righe il cui campo strutturato nomina un altro trace (`rowsOfTraces`); le righe senza campo restano; il motore non cambia                                                                                                           |
| F234-45, trace del secondo tentativo nella correlazione | i nodi delle righe senza trace strutturato correlano anche il trace del secondo tentativo, accanto al fallback UUID                                                                                                                                                    |
| F234-46, «Non riconosciuti: K»                          | le righe di copertura contano le foglie senza caso, una volta ciascuna; la forma storica richiede zero righe di copertura. Si contano le foglie e non ogni nodo, perché la radice di una richiesta API Gateway non ha casi propri e renderebbe la riga sempre presente |

### Ispezione Codex finale di F2–F4 · sesto giro (20 novembre 2026)

Esito: **REVISE**, 5 finding (1 high, 4 medium). Tutti accolti.

| Finding                                                  | Correzione                                                                                                                                                                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F234-47 high, lettura per fallback UUID senza token      | il lettore SEND tiene solo le righe con il token `FALLBACK-UUID` esatto di uno dei suoi UUID, come l'attribuzione dei lotti; la copertura resta quella della query. Le fixture con righe senza token (non restituibili da Logs Insights) ora lo portano |
| F234-48, stop terminale con stato di finestra            | la richiesta senza request id porta `apiGwExecutionLogMode=no-request-id` sul proprio nodo e prosegue col proprio trace                                                                                                                                 |
| F234-49, righe Lambda di un altro lotto                  | ogni lotto tiene solo le righe delle sue invocazioni (`rowsOfInvocations`), anche nelle letture multi-account                                                                                                                                           |
| F234-50, foglie non riconosciute nelle catene interrotte | «Non riconosciuti» conta solo le foglie delle catene concluse                                                                                                                                                                                           |
| F234-51, azioni per gruppo                               | un'azione per caso e per gruppo, dal nodo che lo riconosce nel membro più vecchio                                                                                                                                                                       |

### Ispezione Codex finale di F2–F4 · settimo giro (20 novembre 2026)

Esito: **REVISE**, 3 finding medium. Tutti accolti.

| Finding                                                       | Correzione                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F234-52, lotto di execution log fallito in modalità terminale | anche in modalità terminale un lotto fallito non scarta i lotti letti: diventa copertura `unavailable`, le sue richieste sono elencate in `apiGwExecutionLogIncompleteRequestIds` e il loro nodo ha `apiGwExecutionLogMode=incomplete`, quindi non si ferma |
| F234-53, righe downstream Lambda di un'altra invocazione      | anche il lettore downstream tiene solo le righe delle invocazioni lette (`rowsOfInvocations`)                                                                                                                                                               |
| F234-54, ciclo attraverso le righe di contesto                | una strada verso un servizio già attraversato resta e finisce come `cycle`, invece di essere scartata come già coperta                                                                                                                                      |

### Ispezione Codex finale di F2–F4 · ottavo giro (20 novembre 2026)

Esito: **REVISE**, 3 finding medium. Tutti accolti.

| Finding                                      | Correzione                                                                                                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F234-55, ciclo confrontato sul solo servizio | il percorso dei passaggi di contesto conserva bersaglio, tipo e identificatore; il ciclo è la ripetizione della stessa chiave di discesa, `via` resta per la visualizzazione |
| F234-56, lotto di execution log saturo       | anche un lotto saturo mette le sue richieste fra le incomplete: il loro nodo non si ferma e prosegue col trace                                                               |
| F234-57, messaggi Lambda senza limite        | `lambdaErrorMessage`, `lastErrorMsg` e il messaggio dell'output passano da `boundedText`; classificazione e instradamento restano sulle righe originali                      |

### Ispezione Codex finale di F2–F4 · nono giro (20 novembre 2026)

Esito: **REVISE**, 3 finding medium. Tutti accolti.

| Finding                                            | Correzione                                                                                                                                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F234-58, ciclo dopo un nodo d'errore               | il nodo creato da una discesa eredita nel percorso anche le chiavi dei passaggi di contesto che l'hanno portato lì                                                                                                                                                 |
| F234-59, esito di terminazione scritto dal lettore | il lettore degli execution log non scrive più `terminationReason` né `lastErrorMsg`; li scrive solo lo stop, quando il nodo si ferma. L'opzione `analysisMode` del lettore non serve più ed è rimossa (resta quella del runbook, che decide se aggiungere lo stop) |
| F234-60, copertura degli step di un nodo           | gli step di un nodo con copertura incompleta (anche la sonda condivisa) segnano il nodo; le catene che lo attraversano hanno `incompleteEvidence`                                                                                                                  |

### Ispezione Codex finale di F2–F4 · decimo giro (20 novembre 2026)

Esito: **REVISE**, 2 finding medium. Tutti accolti.

| Finding                                                 | Correzione                                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| F234-61, copertura della sonda riusata                  | ogni nodo che riusa la sonda condivisa ne riceve la copertura; la telemetria resta una sola; la copertura globale non ripete voci identiche |
| F234-62, `branchOutcome` e nodi con evidenza incompleta | un discendente con evidenza incompleta rende il ramo `incomplete`; `diagnosed` mantiene la precedenza                                       |

### Ispezione Codex finale di F2–F4 · undicesimo giro (20 novembre 2026)

Esito: **REVISE**, 3 finding medium. Tutti accolti.

| Finding                                             | Correzione                                                                                                                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F234-63, instradamento fallito su righe di contesto | se gli step d'instradamento falliscono o leggono in modo incompleto, la lettura che li ha prodotti diventa `unavailable`: il ramo è incompleto e la catena non finisce in una foglia vera; le altre strade riuscite restano |
| F234-64, `stepsSkipped` negativo                    | gli step saltati si contano sugli step di finestra, ognuno una volta, anche se eseguito per più nodi o lotti                                                                                                                |
| F234-65, messaggio della sonda B2B senza limite     | `versioningLambdaErrorMessage` passa da `boundedText`                                                                                                                                                                       |

### Ispezione Codex finale di F2–F4 · dodicesimo giro (20 novembre 2026)

Esito: **REVISE**, 3 finding medium. Tutti accolti.

| Finding                                               | Correzione                                                                                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F234-66, declassamento non visto dal padre            | quando un instradamento fallito declassa la lettura a `unavailable`, la lettura si ripubblica sul padre: stato e esclusioni non confermate diventano `unknown`; righe contate ed esclusioni `present` restano |
| F234-67, copertura dei passaggi in `via`              | la discesa promossa da una riga di contesto ricorda la lettura da cui viene; se una lettura del percorso è incompleta, la discesa ha `incompleteVia` e la catena `incompleteEvidence`                         |
| F234-68, lacune dell'execution log su tutte le catene | le voci dei lotti di execution log falliti o saturi sono `scoped`: non rendono incomplete tutte le catene, ma solo il nodo delle richieste di quei lotti (`incompleteEvidence` della radice)                  |

### Chiusura dell'ispezione finale di F2–F4

Per decisione del committente l'ispezione si chiude dopo il dodicesimo giro, senza un tredicesimo. Andamento dei finding
per giro: 17, 12, 7, 6, 4, 5, 3, 3, 3, 2, 3, 3; tutti accolti e corretti, gate verde dopo ogni giro. Le correzioni del
dodicesimo giro non sono state riverificate da Codex.
