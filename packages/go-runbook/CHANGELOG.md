# @pagopa/go-runbook

## 1.0.0-next.1

### Patch Changes

- Updated dependencies [[`879bba9`](https://github.com/pagopa/go-automation/commit/879bba9bd33cbf10e513d4cc37ba04d5f34b8543), [`95d3639`](https://github.com/pagopa/go-automation/commit/95d3639b92e919dbc0b7729f5d4668c1f46fcf43)]:
  - @pagopa/go-common@1.0.0-next.1
  - @pagopa/go-aws@1.0.0-next.1

## 1.0.0-next.0

### Major Changes

- [#281](https://github.com/pagopa/go-automation/pull/281) [`1d670e4`](https://github.com/pagopa/go-automation/commit/1d670e42e86757f418d9839f920473b4e9d30501) Thanks [@maxoly-pagopa](https://github.com/maxoly-pagopa)! - Prima pubblicazione su GitHub Packages (EVO-PKGPUB-OPUS-01): go-common diviso per area in sottopercorsi, go-aws con un sottopercorso per servizio AWS e gli SDK come peer facoltativi, go-runbook con engine, toolkit, inventory e runtime separati.

### Patch Changes

- [#283](https://github.com/pagopa/go-automation/pull/283) [`e3425f4`](https://github.com/pagopa/go-automation/commit/e3425f4eecc5e197aa232f8d9f51f76b0bf83883) Thanks [@maxoly-pagopa](https://github.com/maxoly-pagopa)! - Runbook INTEROP Selfcare: il caso noto `selfcare-kafka-broker-communication-errors`, presente in due runbook con regole diverse, è diviso in `selfcare-users-updater-kafka-broker-errors` (users-updater) e `selfcare-onboarding-kafka-broker-errors` (onboarding-consumer). Le regole e l'esito delle analisi non cambiano.
- Updated dependencies [[`1d670e4`](https://github.com/pagopa/go-automation/commit/1d670e42e86757f418d9839f920473b4e9d30501)]:
  - @pagopa/go-common@1.0.0-next.0
  - @pagopa/go-aws@1.0.0-next.0
