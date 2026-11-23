# SPEC-003 · Registro delle revisioni

## La richiesta del committente

- 19 novembre 2026: tre modifiche a `send-dispatch-notifications`, «l'ultima è provvisoria e non confermata»:
  - estrazione del requestId: `PREPARE_ANALOG_DOMICILE` resta, `PREPARE_DIGITAL_DOMICILE` si toglie e al suo posto
    entra `PREPARE_SIMPLE_REGISTERED_LETTER`;
  - spedizioni analogiche: al requestId recuperato si aggiunge il suffisso `.PCRETRY_0`, o un suffisso
    personalizzato, controllato da un parametro dello script perché può esserci o no;
  - nuovo step facoltativo: leggere `pn-EcRichiesteMetadati` nell'account confinfo con la chiave
    `pn-cons-000~<requestId>` e controllare `statusRequest` (`sent` se l'invio va al consolidatore, `null` se va a
    un mock). L'esito può arrivare dopo 10 minuti, quindi lo step parte con un ritardo configurabile e poi ripete il
    controllo a intervalli.

## La v01

- Specifica: `SPEC-003-DispatchPaperRequestId-CLAUDE-v01.md`, SHA256
  `20ec43e6e8b3d55cbd4868fd5e94351610e8180d64d1ed6d24eec1c518b2c3a4`.
- Fonti: lettura di `scripts/send/send-dispatch-notifications` (configurazione, opzioni della sessione, identità del
  run, validazione, README) e di `packages/go-send/src/dispatch` (fase `request-id`, selezione, journal, stato delle
  righe, decisione in ripresa, output e report, ambienti), e di `AWSDynamoDBService.getItem` di go-aws.
  Nel repository non c'è codice che legga `pn-EcRichiesteMetadati`: i fatti su quella tabella vengono dalla
  richiesta e restano da confermare (§3.3.1).
- Stato: bozza, in attesa delle scelte D1–D3 (parte A e B) e, per la parte C, della conferma del §3.3.1 e delle
  scelte D4–D8.

## Primo giro di revisione Codex (23 novembre 2026)

- Specifica rivista: la v01 come stava su disco, SHA256
  `a3e353511d66ed73f9caec9b22d5bf51ac9b275d6438c5e105d296df95968b64`. Il file era stato ritoccato il 20 novembre,
  dopo la registrazione dello SHA256 qui sopra: il giro vale per questo hash.
- Revisore: Codex CLI 0.170.0, `gpt-6.2-sol`, effort high, sandbox in sola lettura; revisione statica della specifica e
  del codice, senza test eseguiti.
- Esito: **REVISE**, 11 rilievi (4 high, 6 medium, 1 low), verificati sul codice.

| Rilievo                                        | Esito nella v02                                                                                                                                                                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1-LEGACY-SELECTION (high)                     | accolto: le categorie non sono nell'identità del run (`runIdentity.ts`). `requestIdCategories` entra nell'identità; un run vecchio si legge con le categorie di allora (§3.2)                                                          |
| F1-DIRECT-RESUME (medium)                      | accolto in parte: in `direct` categorie e suffisso valgono `''`. Respinta l'identità che si adatta al contenuto del journal: macchinario per un caso di transizione, il messaggio d'errore dice che cosa ripetere (§5)                 |
| F1-NO-PAPER-OUTCOME (medium)                   | accolto: con le nuove categorie una notifica digitale riuscita chiude `REQUEST_ID_NOT_FOUND` ed `exitCodeFor` darebbe `2`. Nuova scelta D9 (§3.1)                                                                                      |
| F1-SUFFIX-DELIMITER (low)                      | accolto: la `\|` è vietata nel suffisso (§3.2)                                                                                                                                                                                         |
| F2-LOOKUP-ELIGIBILITY (high)                   | accolto: si leggono solo gli id delle categorie cartacee; `ec-status` con il suffisso spento è un errore d'uso (§3.3.2)                                                                                                                |
| F2-AWS-TARGET (high)                           | accolto in parte: con `ec-status` l'identità controlla `env` ed `endpoint` e acquista `ecClientId`. Respinta la verifica dell'account fisico: il profilo viene dall'ambiente, che è nell'identità (§5)                                 |
| F2-MIXED-OUTCOMES (high)                       | accolto: esito per id in `ecStatusRequest`, `EC_SENT` ed `EC_MOCK` solo con esiti uniformi, altrimenti `EC_NOT_CONFIRMED`/`MIXED` (§3.3.2)                                                                                             |
| F2-VERIFY-STATE, F2-PHASE-WITHOUT-IDS (medium) | accolti con una sola regola: `ec-status` solo insieme a `request-id`, o da sola in un `--resume`; le altre combinazioni sono errori d'uso prima dell'invio. La precedenza di `verify` sull'accettazione non nota vale anche per `EC_*` |
| F2-EXPIRED-DEADLINE (medium)                   | accolto: il timeout si conta dall'inizio dei controlli nella sessione, come in `RequestIdStage`; in ripresa la riga ha di nuovo tutto il timeout (§3.3.2)                                                                              |
| F2-STALE-ERROR (medium)                        | accolto: `EC_SENT` ed `EC_MOCK` tolgono l'errore. Lo stesso difetto c'è oggi su `REQUEST_ID_FOUND` (`applyJournalEntry.ts`): la correzione entra in F1 (§3.1)                                                                          |

Limiti dichiarati dal revisore: schema, transizioni e tempi reali di `pn-EcRichiesteMetadati` non verificati; il
repository riporta la chiave con il prefisso solo come esempio di `Query`, quindi va confermato anche che basti
`GetItem` (§3.3.1, punto 1).

## La v02

- Specifica: `SPEC-003-DispatchPaperRequestId-CLAUDE-v02.md`, SHA256
  `9968d74d7fb76428aada61faf8f65e4af4ef5aabfdc3d9fd870cc8ff6eb6670d`.
- Per scelta del committente il giro di Codex è uno solo: la v02 non è stata rivista da Codex.
- Stato: bozza, in attesa delle scelte D1–D3 e D9 (parte A e B) e, per la parte C, della conferma del §3.3.1 e delle
  scelte D4–D8.

## Approvazione di F1 (23 novembre 2026)

Il committente approva la v02 e chiede di sviluppare solo **A** (categorie del requestId) e **B** (suffisso del
requestId), lasciando completamente fuori **C** (la fase `ec-status`). Valgono le proposte dell'autore: D1 il suffisso
su tutte le categorie, D2 attivo per default (`.PCRETRY_0`), D3 `digitalRequestId` rinominato in
`simpleRegisteredLetterRequestId`, D9 una notifica digitale riuscita non è un problema del run.

## Sviluppo di F1 (23 novembre 2026)

- go-send: categorie predefinite `PREPARE_ANALOG_DOMICILE`, `PREPARE_SIMPLE_REGISTERED_LETTER`; `suffix` nelle opzioni
  di `selectRequestIds`; `PREPARE_SIMPLE_REGISTERED_LETTER` fra le prove di accettazione; `REQUEST_ID_FOUND` toglie
  l'errore; colonna `simpleRegisteredLetterRequestId`; il ledger conta le righe chiuse da
  `WORKFLOW_ENDED:DIGITAL_SUCCESS_WORKFLOW` (`requestIdNotExpected` nel progresso).
- Script: `--request-id-append-suffix` e `--request-id-suffix`; `requestIdCategories` e `requestIdSuffix`
  nell'identità del run, con i valori di allora per un `run.json` vecchio e il parametro da ripetere nel messaggio
  d'errore; uscita, riepilogo e log delle transizioni per D9; il piano mostra categorie e suffisso; README.
- Scostamenti dalla v02:
  - in go-send `DEFAULT_REQUEST_ID_OPTIONS.suffix` vale `''`: il default `.PCRETRY_0` è quello del parametro dello
    script;
  - i commenti esistenti che citano la regola del `jq` non sono stati toccati, per regola del committente sui
    commenti; il README sì;
  - `TransitionLogger` non segnala più come avviso le righe chiuse da un workflow digitale riuscito.
- Prova sui dati reali: sulle 35 timeline di TEST della fixture la nuova regola dà 32 id (20 analogici, 12
  raccomandate semplici) con `.PCRETRY_0`, uguali a quelli calcolati in modo indipendente
  (`timelines-sample-paper.csv`); il confronto con il `jq` resta sulla regola di prima.
