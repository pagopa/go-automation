---
'@pagopa/go-common': minor
---

La console del logger raggruppa l'output in blocchi; il file di log e i log JSON non cambiano.

- **Blocchi.** `GOConsoleLoggerHandler` apre una scheda per ogni `header()` (`╭─ titolo`, chiusa da `╰─`) e un blocco per ogni `section()` (`◆ titolo`); ogni riga di una scheda o di una sezione sta dietro la barra `│`, e una riga `│` unisce due sezioni consecutive. Il rientro a spazi sotto header e sezioni non c'è più, e `newline()` dentro un blocco stampa la sola barra.
- **Info.** Le righe di `info()` non hanno più il prefisso `ℹ` né il colore magenta.
- **`GOLogger.fields(entries)`.** Coppie chiave/valore, una per riga, con le chiavi allineate alla più larga.
- **`GOLogger.tree(nodes, options?)`.** Un albero (`TreeNode`, lo stesso di `renderTree`), una riga per evento, con i rami `├─`/`└─` scelti dalla posizione; senza rientro, salvo `options.indent`.
