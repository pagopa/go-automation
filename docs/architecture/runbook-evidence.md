# Output delle diagnostiche dei runbook

Stato: adottato.

## Decisione

Le evidenze di uno step custom si dichiarano sul suo `StepDescriptor`, accanto
allo step o al relativo hook. `sourceStep` deriva dall'istanza collegata alla
pipeline. Non esiste una seconda lista di ID da mantenere nel contesto della
famiglia.

`buildRunbookOutput` compone una sola volta il contesto standard della famiglia,
le evidenze dichiarate sugli step e gli eventuali campi diagnostici del runbook.
La stessa funzione serve output CLI e occurrence cloud. La composizione legge
risultati già raccolti e non esegue query.

Le famiglie service, API Gateway e Lambda continuano a costruire il proprio
contesto standard. Non interpretano opzioni dei singoli runbook. Per aggiungere
un'evidenza custom non si modificano i loro tipi, type guard o renderer.

## Evidenze accanto al produttore

```typescript
hooks: [
  {
    at: 'before-cid-analysis',
    step: new QueryDelegationItemsArchiverContextStep(),
    evidence: [
      {
        id: 'delegation-items-archiver-context',
        label: 'Contesto di riavvio e recupero archiviazione',
        type: 'log-sample',
        messageFields: ['log', '@message'],
        retention: { mode: 'all' },
      },
    ],
  },
];
```

La stessa opzione `evidence` è disponibile in `RunbookBuilder.step(step, options)`.
Gli hook K8s passano dal builder, prima che l'analisi CID possa risolvere il caso:
non si modificano gli array degli step dopo la validazione.

| Tipo          | Dati richiesti               | Output                                                               |
| ------------- | ---------------------------- | -------------------------------------------------------------------- |
| `log-sample`  | Una colonna messaggio valida | Tutte le colonne originali, più `message` e `timestamp` normalizzati |
| `step-output` | Righe `ResultField`          | Tutte le colonne originali, anche senza messaggio                    |

Gli alias del messaggio hanno un ordine esplicito. Nei log Kubernetes si usa
prima `log`, conservando comunque l'involucro JSON in `@message`.
Timestamp, stream, trace/CID, account e messaggi ripetuti rimangono disponibili.
Un filtro opzionale `{ field, equals }` separa result set misti, ad esempio
`queryKind = errors` e `queryKind = streams`.

## Conservazione

- `retention: { mode: 'all' }` conserva tutte le righe idonee raccolte. Si usa
  per query circoscritte che rifiutano risultati incompleti o saturati: l'inizio
  di un episodio Kafka o di un avvio Strapi è parte della diagnosi.
- `retention: { mode: 'latest', limit: N, timestampField: '...' }` conserva le
  ultime N righe e le presenta in ordine cronologico. La colonna è dichiarata:
  può essere `@timestamp` per gli errori oppure `lastLog` per gli stream.

`truncated` indica che il campionamento dell'output ha escluso righe idonee.
Non attesta la completezza della query AWS: quella resta responsabilità dello
step. Righe senza messaggio non sono log e non contano come troncamento.
Risultati assenti, vuoti o incompatibili non generano evidenze sintetiche.
Il limite dei log standard di una famiglia non sovrascrive la conservazione
dichiarata da uno step custom.

## Campi diagnostici

SPID Hub e Logsaver usano anche `RunbookBuilder.output`:

```typescript
.output({
  metadata: { service: 'pn-logsaver-be', logGroup: '/aws/ecs/pn-logsaver-be' },
  fields: [
    {
      name: 'logsaverErrorLogCount',
      label: 'Log di errore',
      ref: 'vars.logsaverErrorLogCount',
      valueType: 'integer',
    },
  ],
})
```

`context.fields` contiene valori leggibili per gli operatori.
`context.details.diagnostics` contiene i valori delle variabili con il tipo
dichiarato, inclusi gli zeri; un valore assente non diventa zero.
`context.details.metadata` contiene informazioni statiche sulla sorgente e
sulla correlazione; `context.details.alarm` contiene allarme e intervallo.
I riferimenti `params.*` possono alimentare i campi senza essere duplicati
fra le diagnostiche osservate.

## Runbook riesaminati

| Runbook                                                                       | Politica                                                             |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Delegation outbound writer e delegation items archiver                        | Episodio completo                                                    |
| Public catalog Strapi                                                         | Avvio e richieste HTTP completi                                      |
| Catalog platformstate writer, purpose outbound writer, notification scheduler | Contesto completo, prima non esportato                               |
| PNPG national registries                                                      | Avvio e completamento applicativo per trace                          |
| SPID Hub                                                                      | Ultimi 5 errori e ultimi 5 stream, separati e con contatori completi |
| Logsaver                                                                      | Ultimi 5 errori e ultimi 5 stream, con account e contatori completi  |
| B2B Lambda versioning                                                         | Ultimi 5 errori del probe                                            |
| API Gateway execution logs, inclusi IO_EXP e BFF                              | Ultimi 5 log con request ID                                          |

I builder rifiutano ID duplicati, limiti non interi o non positivi, alias vuoti
e riferimenti diagnostici non validi. I test coprono conservazione dell'inizio
dell'episodio, query vuote/fallite, campionamento, righe aggregate e composizione
con il contesto standard.

## Alternative e compromessi

`additionalLogEvidence` sulle configurazioni delle famiglie richiedeva
forwarding e validazione duplicati, riferimenti a step lontani dalla pipeline e
limiti di campionamento usati per esprimere la conservazione completa.
Un renderer per ogni allarme duplicava selezione, ordinamento e serializzazione.
Entrambi i meccanismi sono rimossi.

La dichiarazione comune accetta result set `ResultField`; non serializza
automaticamente qualunque oggetto restituito dagli step. Le trasformazioni
di dominio e gli output annidati mantengono i propri contratti: non vengono
interpretati come log tramite euristiche.
