# Verifica documentale e scelte di implementazione

Verifica del 17 settembre 2026 sulla [pagina Confluence, versione 7 del 10 settembre 2026](https://pagopa.atlassian.net/wiki/spaces/GO/pages/3197961176/k8s-interop-be-istat-certified-attributes-importer-errors) e sulle card collegate, inclusi tutti i commenti restituiti da Jira.

Il catalogo non conteneva questo allarme. L’implementazione registra prod, att e test e riconosce i due casi documentati sia nei log applicativi sia nei risultati del CID tracker. Le query selezionano il log group dell’ambiente risolto, ERROR o stderr, il pod importer ed escludono adot-collector. In assenza di CID, la pipeline usa comunque i log applicativi. Gli errori diversi restano non classificati.

## Chiarimenti ottenuti dalle card

- [PIN-10823](https://pagopa.atlassian.net/browse/PIN-10823), elencata solo in testa alla pagina, è la correzione del livello dei log 409 da ERROR a WARN. Il conflitto per attributo già assegnato resta un comportamento gestito, come confermato nei commenti di [PIN-10543](https://pagopa.atlassian.net/browse/PIN-10543).
- Alla verifica, PIN-10823 è in QA e associata alla Core 2.23.0: Jira riporta `released=false` e `releaseDate=2026-09-14`. Confluence dice «dal 1 ottobre», senza anno o calendario per ambiente. Nessuno di questi dati prova la versione realmente installata: non viene introdotta una soglia automatica basata sulla data.
- PIN-10543 risulta Done, fix version Core 2.21.0, rilasciata il 23 luglio 2026. I primi commenti ipotizzano una configurazione certifier mancante nel read-model e una chiamata maintenance; un aggiornamento successivo rivede l’ipotesi verso una costante ISTAT mancante in email-notification-dispatcher. Non è quindi corretto prescrivere automaticamente una modifica al tenant.
- L’esempio dettagliato del duplicato proviene da tenant-process (WARN); l’importer emette il messaggio `internalAssignDiscreteCertifiedAttribute` con 409 (ERROR). La tabella attribuisce entrambi all’importer. Il CID tracker consente di recuperare il dettaglio del servizio correlato.

## Informazioni da completare o correggere

- Collegare PIN-10823 direttamente al caso 409 e precisare che dopo la correzione non è atteso l’allarme, non che scompaia il conflitto HTTP.
- Confermare versione/data di deploy per ambiente e criterio di escalation per ricorrenze dopo la correzione. Verificare anche lo stream: la query include stderr indipendentemente dalla severity, quindi il solo passaggio a WARN non dimostra che l’allarme non scatterà.
- Completare causa finale e azioni per `Certifier tenant ISTAT not found`, distinguendo importer, dispatcher e servizi correlati. La pagina non documenta una procedura risolutiva né un criterio di chiusura.
- Correggere il link «Casi noti»: punta a `pages/edit-v2/2783346689`, non alla pagina 3197961176.
- Specificare la finestra temporale: manca nella pagina; l’implementazione usa il default di catalogo, 5 minuti prima e 5 dopo l’occorrenza. Gli esempi di log group sono solo prod, mentre gli allarmi elencati coprono tutti e tre gli ambienti.
- Il runbook esistente `k8s-interop-be-notification-user-lifecycle-consumer-errors` classifica lo stesso messaggio ISTAT come COMPLETED senza azione. Questa politica non è trasferita all’importer: il documento qui verificato e le card non dimostrano che una nuova ricorrenza sia innocua. Il runbook del consumer non è stato modificato.

## Esiti automatici

Entrambi i casi restano IN_PROGRESS: il 409 richiede di verificare versione e modalità di logging, mentre il tenant ISTAT mancante richiede la verifica di una ricorrenza di un problema già corretto. Il riconoscimento del messaggio non prova queste condizioni. Non vengono eseguite chiamate maintenance, modifiche al DB o notifiche esterne.

La pipeline standard segue i CID disponibili anche quando il messaggio applicativo è noto: conserva così le evidenze dei servizi coinvolti. Questo approfondimento è più esteso dello stop anticipato consentito dalla pagina e non modifica lo stato dei servizi.
