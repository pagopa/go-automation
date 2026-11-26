# @pagopa/go-aws

## 1.0.0-next.2

### Minor Changes

- [#298](https://github.com/pagopa/go-automation/pull/298) [`811f211`](https://github.com/pagopa/go-automation/commit/811f211d37f8c9b7e9d79ac856b6ec1bca2789fc) - Logs Insights: risultati parziali e completezza per query.

  - Ogni `AWSCloudWatchLogsQueryExecution` riporta le righe restituite (`rowsReturned`) e le pagine non lette (`unreadPages`: `budget` o `failed`).
  - Con la nuova opzione `partialResults` una lettura fallita o troncata non butta più quanto già letto: si restituiscono le righe delle query e delle pagine riuscite, le pagine non lette restano sull'esecuzione e le letture fallite dopo aver provato tutti i candidati finiscono in `failedReads`. L'annullamento e gli errori di configurazione del target continuano a lanciare un'eccezione. Senza l'opzione il comportamento non cambia.

### Patch Changes

- Updated dependencies [[`57bfaf8`](https://github.com/pagopa/go-automation/commit/57bfaf84f77fc80b05f4e2ef533dcf804a37ef74), [`57bfaf8`](https://github.com/pagopa/go-automation/commit/57bfaf84f77fc80b05f4e2ef533dcf804a37ef74)]:
  - @pagopa/go-common@1.0.0-next.2

## 1.0.0-next.1

### Patch Changes

- Updated dependencies [[`879bba9`](https://github.com/pagopa/go-automation/commit/879bba9bd33cbf10e513d4cc37ba04d5f34b8543), [`95d3639`](https://github.com/pagopa/go-automation/commit/95d3639b92e919dbc0b7729f5d4668c1f46fcf43)]:
  - @pagopa/go-common@1.0.0-next.1

## 1.0.0-next.0

### Major Changes

- [#281](https://github.com/pagopa/go-automation/pull/281) [`1d670e4`](https://github.com/pagopa/go-automation/commit/1d670e42e86757f418d9839f920473b4e9d30501) Thanks [@maxoly-pagopa](https://github.com/maxoly-pagopa)! - Prima pubblicazione su GitHub Packages (EVO-PKGPUB-OPUS-01): go-common diviso per area in sottopercorsi, go-aws con un sottopercorso per servizio AWS e gli SDK come peer facoltativi, go-runbook con engine, toolkit, inventory e runtime separati.

### Patch Changes

- Updated dependencies [[`1d670e4`](https://github.com/pagopa/go-automation/commit/1d670e42e86757f418d9839f920473b4e9d30501)]:
  - @pagopa/go-common@1.0.0-next.0
