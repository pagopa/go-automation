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
