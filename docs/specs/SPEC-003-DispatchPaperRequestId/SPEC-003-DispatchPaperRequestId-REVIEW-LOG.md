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
