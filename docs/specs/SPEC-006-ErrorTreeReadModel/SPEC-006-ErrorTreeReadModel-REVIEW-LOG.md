# SPEC-006 · Error tree read model — registro delle revisioni

## Origine (21 novembre 2026)

Revisione architetturale di `packages/go-runbook` del 20 novembre 2026, candidato 3 («Error tree read model»). Il
committente lo sceglie dopo il completamento della trace identity e, nell'esame delle decisioni, accoglie le proposte
D1–D4. Chiede una specifica rivista da Codex prima dello sviluppo; i rilievi si valutano nel merito, senza accoglierli
a prescindere.

## Versioni

| Versione | File                                        | SHA256                                                             |
| -------- | ------------------------------------------- | ------------------------------------------------------------------ |
| v01      | `SPEC-006-ErrorTreeReadModel-CLAUDE-v01.md` | `6a9b12bdde066556471125d6cc4097c8f5e3cde45d0f6d4be52b78dcd259b762` |
| v02      | `SPEC-006-ErrorTreeReadModel-CLAUDE-v02.md` | `f5bdb79e0b19e7931125773346cd998e12a6363b3702d620187279d585fdb4ce` |
| v03      | `SPEC-006-ErrorTreeReadModel-CLAUDE-v03.md` | `47b76a223324f8415f2dd8eb80f3074e06376cf4721d3afb0d1849345731cf16` |

## Primo giro di revisione Codex (21 novembre 2026)

Esito: **REVISE**, 4 rilievi (2 medium, 2 low). Valutati sul codice e accolti nella v02.

| Rilievo                                             | Valutazione e correzione nella v02                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RV-01 medium, tre viste nel percorso del catalogo   | fatto corretto; il costo è O(N), non un difetto, ma la correzione è gratuita: i costruttori controllano la famiglia prima di costruire la vista (§3.4) |
| RV-02 low, firme dei costruttori di contesto        | errore di fatto della v01: le firme hanno `options`, riportate (§3.4)                                                                                  |
| RV-03 medium, livelli raggiunti solo da una discesa | regressione reale (servizio d'ingresso non interrogato nei runbook SEND): `levels()` conserva quei livelli e i `lowerBound` (§3.1)                     |
| RV-04 low, dove cambia il testo dei motivi          | precisazione: la copertura strutturata tiene i codici; il testo cambia nella bozza e nella console di go-analyze-alarm (§2)                            |

## Secondo giro di revisione Codex (21 novembre 2026), annullato

Codex trova la v02 identica alla v01 e i quattro rilievi aperti: lo script che scriveva la v02 si era fermato su
una riga riformattata da Prettier, e il registro ne riportava l'hash. Errore di Claude. La v02 è riscritta con le
correzioni del primo giro e l'hash qui sopra è aggiornato; il giro si ripete.

## Secondo giro di revisione Codex, ripetuto (21 novembre 2026)

Esito: **REVISE**, 2 rilievi. RV-01, RV-02 e RV-04 del primo giro chiusi. I due rilievi sono precisazioni del testo,
corrette sul codice, accolte nella v03.

| Rilievo                                          | Correzione nella v03                                                                                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| RV-03 medium, livello letto senza nodi           | `levels()` crea il livello di ogni destinazione di discesa, con i conteggi a zero; `lowerBound` solo se la discesa non è `queried`, come oggi (§3.1) |
| RV-05 low, osservazioni del nodo della detection | la §2 dice, come la §3.2, che le osservazioni comprendono la correlazione del nodo della detection e dei suoi antenati                               |

## Terzo giro di revisione Codex (21 novembre 2026)

Esito: **APPROVED**. I rilievi RV-01–RV-05 sono chiusi; nessun difetto materiale nel perimetro richiesto. La v03 è
pronta per l'approvazione del committente.

## Approvazione (21 novembre 2026)

Il committente approva la **v03** dopo il terzo giro di revisione Codex. Lo sviluppo parte dalla v03.

## Sviluppo (21 novembre 2026)

Stato di partenza: build verde, 1207 test di go-runbook verdi.

**Read model** (`packages/go-runbook/src/toolkits/common/output/tree`): `ErrorTreeView` (nodi, percorso e chiavi di
un nodo, nodo di una detection, nodi e ultimo nodo di una catena, nodo rappresentativo, stato di un nodo, foglie non
riconosciute, interruzioni per motivo, catene interrotte, livelli con quelli raggiunti solo da una discesa,
osservazioni della correlazione), `mergeObservations`, `CORRELATION_KINDS`, `ERROR_CHAIN_INTERRUPTION_WORDS`,
`ErrorTreeNodeStatus`, `ErrorTreeReading` (vista, catene e righe di copertura calcolate una volta).

**Consumer**: `buildErrorChains` e `buildCoverageLines` tengono la firma e delegano a `errorChainsOf` e
`coverageLinesOf`, che ricevono la vista; `buildAnalysisDraft` delega ad `analysisDraftOf`, che riceve la lettura
dell'albero già calcolata; `buildRunbookOutput` costruisce vista, catene e righe di copertura una volta e le passa a
esito, catene, copertura (`evidenceComplete`, `treeCoverage`), contesto dichiarato e bozza. `resultContexts`
(`detectionContext`, `detectionObservations`, `representativeContext`) riceve la vista: sparisce il `WeakMap`.
`buildDeclaredOutputContext` usa `keyPath`. `renderErrorChainLines` usa la tabella unica dei motivi. I tre
costruttori di contesto delle famiglie controllano la famiglia prima di costruire la vista. In `treeNoteEntries` la
ricerca O(N²) dei nodi riconosciuti diventa O(N).

**go-watchtower-runbook**: `CACHE_FINGERPRINT_VERSION` passa a 17.

**API pubblica**: invariata (report API senza differenze). Changeset `error-tree-read-model` (patch).

**Test**: nuovi `ErrorTreeView`, `mergeObservations` (con la fixture `errorTreeFixture`), `buildCoverageLines`,
`renderErrorChainLines`, `resultContexts`; cache con la versione 16. I casi «famiglia diversa → `undefined`» dei
costruttori di contesto erano già coperti. Il numero dei passaggi di `buildErrorChains` per output non ha un test
dedicato: si vede nel codice di `buildRunbookOutput`, che chiama `errorChainsOf` una volta e passa il risultato alla
bozza.

**Verifica** (21 novembre 2026): `pnpm check` verde (build, test con 1225 test di go-runbook e 59 di
go-watchtower-runbook, coverage, published, lint, format, unused, dependencies, duplicates, types, scaffold,
new-classes, workflows, shell). I due warning di lint restano quelli preesistenti di go-send.
