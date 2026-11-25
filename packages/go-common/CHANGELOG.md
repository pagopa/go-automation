# @pagopa/go-common

## 1.0.0-next.1

### Patch Changes

- [#291](https://github.com/pagopa/go-automation/pull/291) [`879bba9`](https://github.com/pagopa/go-automation/commit/879bba9bd33cbf10e513d4cc37ba04d5f34b8543) - `GOChildProcess.stop()`: il timer di attesa prima del `SIGKILL` viene annullato appena il processo termina, quindi non tiene più vivo il chiamante fino a 5 secondi dopo l'arresto.

- [#291](https://github.com/pagopa/go-automation/pull/291) [`95d3639`](https://github.com/pagopa/go-automation/commit/95d3639b92e919dbc0b7729f5d4668c1f46fcf43) - - `GOTableFormatter` con `border: false`: le righe non hanno più i bordi esterni `│`, così i separatori `┼` sono allineati ai `│` tra le celle (prima erano spostati di una colonna). Gli stili con bordo e `compact` non cambiano.
  - `GOJSONFormatDetector`: l'estensione si legge solo dal nome del file. Un punto in una directory (`.cache/data`, `exports.v2/data`) non viene più riportato come estensione nei `details`; il formato rilevato non cambia.

## 1.0.0-next.0

### Major Changes

- [#281](https://github.com/pagopa/go-automation/pull/281) [`1d670e4`](https://github.com/pagopa/go-automation/commit/1d670e42e86757f418d9839f920473b4e9d30501) Thanks [@maxoly-pagopa](https://github.com/maxoly-pagopa)! - Prima pubblicazione su GitHub Packages (EVO-PKGPUB-OPUS-01): go-common diviso per area in sottopercorsi, go-aws con un sottopercorso per servizio AWS e gli SDK come peer facoltativi, go-runbook con engine, toolkit, inventory e runtime separati.
