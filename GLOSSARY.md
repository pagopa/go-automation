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
- **Forma canonica di un trace id**: la forma X-Ray in minuscolo (`1-xxxxxxxx-yyyyyyyyyyyyyyyyyyyyyyyy`), la stessa
  per un id compatto a 32 cifre, per un header X-Ray e per un id seguito da altri campi dopo `;`.
- **Forme di ricerca di un trace id**: le forme in cui i log scrivono lo stesso trace, X-Ray e compatta; le query le
  cercano tutte.
