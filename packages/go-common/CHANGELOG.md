# @pagopa/go-common

## 1.0.0-next.2

### Minor Changes

- [#298](https://github.com/pagopa/go-automation/pull/298) [`57bfaf8`](https://github.com/pagopa/go-automation/commit/57bfaf84f77fc80b05f4e2ef533dcf804a37ef74) - La console del logger raggruppa l'output in blocchi; il file di log e i log JSON non cambiano.

  - **Blocchi.** `GOConsoleLoggerHandler` apre una scheda per ogni `header()` (`╭─ titolo`, chiusa da `╰─`) e un blocco per ogni `section()` (`◆ titolo`); ogni riga di una scheda o di una sezione sta dietro la barra `│`, e una riga `│` unisce due sezioni consecutive. Il rientro a spazi sotto header e sezioni non c'è più, e `newline()` dentro un blocco stampa la sola barra.
  - **Info.** Le righe di `info()` non hanno più il prefisso `ℹ` né il colore magenta.
  - **`GOLogger.fields(entries)`.** Coppie chiave/valore, una per riga, con le chiavi allineate alla più larga.
  - **`GOLogger.tree(nodes, options?)`.** Un albero (`TreeNode`, lo stesso di `renderTree`), una riga per evento, con i rami `├─`/`└─` scelti dalla posizione; senza rientro, salvo `options.indent`.

- [#298](https://github.com/pagopa/go-automation/pull/298) [`57bfaf8`](https://github.com/pagopa/go-automation/commit/57bfaf84f77fc80b05f4e2ef533dcf804a37ef74) - `GOJSONStreamWriter` (`@pagopa/go-common/exporters`) scrive un valore su uno stream come JSON, a pezzi, con lo stesso testo di `JSON.stringify` e rispettando la backpressure. `GOJSONFileExporter` lo usa: un valore il cui testo non sta in una stringa (per esempio la traccia di un'esecuzione con migliaia di step) si scrive senza `Invalid string length`; il file si scrive in un temporaneo nella stessa cartella e prende il nome finale solo quando è completo, quindi un'esportazione fallita lascia il file precedente com'era.

## 1.0.0-next.1

### Patch Changes

- [#291](https://github.com/pagopa/go-automation/pull/291) [`879bba9`](https://github.com/pagopa/go-automation/commit/879bba9bd33cbf10e513d4cc37ba04d5f34b8543) - `GOChildProcess.stop()`: il timer di attesa prima del `SIGKILL` viene annullato appena il processo termina, quindi non tiene più vivo il chiamante fino a 5 secondi dopo l'arresto.

- [#291](https://github.com/pagopa/go-automation/pull/291) [`95d3639`](https://github.com/pagopa/go-automation/commit/95d3639b92e919dbc0b7729f5d4668c1f46fcf43) - - `GOTableFormatter` con `border: false`: le righe non hanno più i bordi esterni `│`, così i separatori `┼` sono allineati ai `│` tra le celle (prima erano spostati di una colonna). Gli stili con bordo e `compact` non cambiano.
  - `GOJSONFormatDetector`: l'estensione si legge solo dal nome del file. Un punto in una directory (`.cache/data`, `exports.v2/data`) non viene più riportato come estensione nei `details`; il formato rilevato non cambia.

## 1.0.0-next.0

### Major Changes

- [#281](https://github.com/pagopa/go-automation/pull/281) [`1d670e4`](https://github.com/pagopa/go-automation/commit/1d670e42e86757f418d9839f920473b4e9d30501) Thanks [@maxoly-pagopa](https://github.com/maxoly-pagopa)! - Prima pubblicazione su GitHub Packages (EVO-PKGPUB-OPUS-01): go-common diviso per area in sottopercorsi, go-aws con un sottopercorso per servizio AWS e gli SDK come peer facoltativi, go-runbook con engine, toolkit, inventory e runtime separati.
