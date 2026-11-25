# Glossario

Termini di dominio del repository, con il nome che usano codice e documentazione.

## go-runbook

- **Lettura**: una query di uno step o di un livello dell'albero d'errore sui log di una finestra o di un nodo.
- **Lacuna**: ciò che manca a una lettura per essere completa (`saturated`, `unavailable`, `skipped`); riguarda tutta
  la finestra o solo gli identificatori che nomina.
- **Stato di una lettura**: `queried` (completa), `saturated`, `unavailable`, `skipped`, `cycle`, in quest'ordine di
  gravità. Una lettura con più lacune ha lo stato della più grave.
- **Read ledger**: il module che registra le lacune di un'esecuzione e risponde allo stato di una lettura, di un
  livello per un nodo, della finestra e di un nodo.
- **Formato di un trace id**: un tipo d'identificativo di tracciamento che il toolkit riconosce (`TRACE_ID_FORMATS`):
  X-Ray Trace ID con la sua forma compatta (il Trace ID di W3C), Fallback UUID di SEND, `traceId:<uuid>`.
- **Forma canonica di un trace id**: la forma con cui un trace id si confronta e si correla, una per formato: per X-Ray
  la forma X-Ray in minuscolo (`1-xxxxxxxx-yyyyyyyyyyyyyyyyyyyyyyyy`), la stessa per un id compatto, per un header X-Ray
  o `traceparent`; per gli UUID il prefisso del formato e l'UUID in minuscolo.
- **Forme di ricerca di un trace id**: le forme in cui i log scrivono lo stesso trace (per X-Ray la X-Ray e la
  compatta); le query le cercano tutte.
- **Read model dell'albero** (`ErrorTreeView`): la vista dell'albero d'errore di un'esecuzione, costruita una volta
  per l'output e la bozza: nodi, percorsi, catene, conteggi per livello e per interruzione.
