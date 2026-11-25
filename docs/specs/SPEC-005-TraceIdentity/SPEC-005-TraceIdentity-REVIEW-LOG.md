# SPEC-005 · Trace identity — registro delle revisioni

## Origine (21 novembre 2026)

Revisione architetturale di `packages/go-runbook` del 20 novembre 2026, candidato 2 («Trace identity»). Il
committente lo sceglie dopo il completamento del read ledger e, nell'esame delle decisioni, accoglie le proposte su
D1–D3 e sceglie di includere go-watchtower-runbook (D4). Chiede una specifica rivista da Codex prima dello sviluppo.

## Versioni

| Versione | File                                   | SHA256                                                             |
| -------- | -------------------------------------- | ------------------------------------------------------------------ |
| v01      | `SPEC-005-TraceIdentity-CLAUDE-v01.md` | `59d864ecfab290f06cfcc98313296137217c499daf075d425c27059ecd1cad02` |
| v02      | `SPEC-005-TraceIdentity-CLAUDE-v02.md` | `8d67bd6ac9dd319fcb3bfc2760f2c592d5e543421661d8a0abef7cc6c6495acc` |
| v03      | `SPEC-005-TraceIdentity-CLAUDE-v03.md` | `ae64b7e668ed70e6bac63792b591cfd4220c8ed9220f6626da4b5c670393593c` |
| v04      | `SPEC-005-TraceIdentity-CLAUDE-v04.md` | `e721e811ba6d50908f71fb7150c887debb60df0e2c09ecf3a2f5f078b8c40664` |
| v05      | `SPEC-005-TraceIdentity-CLAUDE-v05.md` | `e4ad8e9ee19d94080d7ff383129e35a728dea96cb1238b1f27a2ed97b06a5d16` |
| v06      | `SPEC-005-TraceIdentity-CLAUDE-v06.md` | `25800b9c0266d91e549d09aa89313d78208aa2fdcb1e61925eaeb9eb7fe9abf3` |
| v07      | `SPEC-005-TraceIdentity-CLAUDE-v07.md` | `bf70ccbb0adbda0e01ce903c06192e85dbed2c56a419c3c6a9e882e46237309b` |
| v08      | `SPEC-005-TraceIdentity-CLAUDE-v08.md` | `240a248c7c8712e2c50e67e2df546dc1eefcb9312ba05a800af42fad932f4291` |
| v09      | `SPEC-005-TraceIdentity-CLAUDE-v09.md` | `2ffefec5c5a0f53c3b791a7ff52a647d49a7f887fd0a0898a75403ec3fcf3cc3` |
| v10      | `SPEC-005-TraceIdentity-CLAUDE-v10.md` | `8f963c81262b1b07e95c0fbb7169d436c90587bcc6d7503c8f805bc29bdd2ad4` |

## Primo giro di revisione Codex (21 novembre 2026)

Esito: **REVISE**, 5 rilievi (1 high, 3 medium, 1 low). Accolti nella v02; RL-01 in parte, con il resto dichiarato
fuori.

| Rilievo                                                     | Correzione nella v02                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RL-01 high, grafia in maiuscolo nelle ricerche              | lo step di finestra passa a `traceIdForms` la grafia data, che resta fra le forme cercate (§3.5); il secondo tentativo per fallback UUID con un trace in maiuscolo è dichiarato fuori: X-Ray genera i trace in minuscolo e le forme in maiuscolo raddoppierebbero i predicati di lotti fino a 50 trace (§5) |
| RL-02, template personalizzati senza campi di attribuzione  | `ServiceTraceLevelReader` filtra solo le query standard; un `traceQueryOverride` resta com'è (§3.4)                                                                                                                                                                                                         |
| RL-03, completamento PNPG di un altro trace                 | lo step di finestra filtra le righe per trace con il matcher, campo strutturato prima del messaggio (§3.5)                                                                                                                                                                                                  |
| RL-04, request id compatto contro trace X-Ray in Watchtower | `DetectedCase.identifiers` porta il tipo; l'equivalenza fra forme vale solo per i `traceId`, il confronto senza maiuscolo resta per tutti (§3.6)                                                                                                                                                            |
| RL-05, `xRayTraceId` nei rami per fallback UUID             | descritta la riscrittura con la forma canonica e il valore nel report; test del secondo tentativo (§3.3, §4)                                                                                                                                                                                                |

## Secondo giro di revisione Codex (21 novembre 2026)

Esito: **REVISE**, 4 rilievi medium. Accolti nella v03 togliendo macchinario invece di aggiungerlo: tre nascevano
dalle eccezioni introdotte nella v02.

| Rilievo                                                        | Correzione nella v03                                                                                                                                                         |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RV2-01, PNPG senza `@message` nella proiezione                 | lo step di finestra filtra con `rowsOfTraces` sul solo campo trace: una riga senza `trace_id` resta, come oggi (§3.5)                                                        |
| RV2-02, X-Ray maiuscolo nel messaggio di un errore di servizio | dichiarato fuori insieme al secondo tentativo: i trace in maiuscolo nelle riletture dell'albero, con lo stesso motivo (§5)                                                   |
| RV2-03, template personalizzato con `trace_id` discordante     | il filtro dei lettori resta `rowsOfTraces` per ogni template; tolta l'eccezione dei template personalizzati e l'unificazione con l'attribuzione, dichiarata fuori (§3.4, §5) |
| RV2-04, `cid` pubblicato come `traceId` nel contesto           | gli id del contesto restano senza tipo; l'equivalenza fra forme vale solo per le osservazioni `traceId` delle detection (§3.6)                                               |

## Terzo giro di revisione Codex (21 novembre 2026)

Esito: **REVISE**, 3 rilievi (2 medium, 1 low). Accolti nella v04, ancora togliendo macchinario.

| Rilievo                                                       | Correzione nella v04                                                                                           |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| RV3-01, trace dei rami instradati per fallback UUID           | comportamento di oggi, indipendente dalla forma del trace: dichiarato fuori (§5)                               |
| RV3-02, corrispondenza esatta di Watchtower sul valore grezzo | `enumerateApiGwRequests` tiene il ripiego sul valore grezzo come oggi; tolto il cambio di comportamento (§3.2) |
| RV3-03, tabella del matcher con i lettori                     | la tabella elenca solo l'attribuzione; i lettori usano `rowsOfTraces` (§3.4)                                   |

## Quarto giro di revisione Codex (21 novembre 2026)

Esito: **REVISE**, 2 rilievi medium. RV4-02 accolto nella v05, RV4-01 dichiarato fuori.

| Rilievo                                                         | Esito nella v05                                                                                                                                                  |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RV4-01, forma compatta dentro un token più lungo nell'hook PNPG | fuori, con il motivo: i log di completamento hanno `trace_id` e il caso non si osserva; un vincolo dedicato all'hook sarebbe macchinario per un caso limite (§5) |
| RV4-02, due valori opachi senza forma canonica                  | l'equivalenza fra forme richiede due forme canoniche definite; test in entrambi i chiamanti (§3.6, §4)                                                           |

## Quinto giro di revisione Codex (21 novembre 2026)

Esito: **REVISE**, 3 rilievi (1 medium, 2 low). Accolti nella v06.

| Rilievo                                             | Correzione nella v06                                                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RV5-01, secondo tentativo con candidati discordanti | tolto l'ampliamento della policy `field`: il campo vale solo come id diretto, come oggi; `matchTraceIdCandidate` entra nel module e usa `bareTraceId` (§3.1, §3.3) |
| RV5-02, `A;Root=B`                                  | forme disgiunte: il primo segmento, se è un id diretto, vale prima di `Root=` (§3.2)                                                                               |
| RV5-03, campo trace di soli spazi                   | il matcher toglie gli spazi ai bordi del campo prima di decidere (§3.4)                                                                                            |

## Sesto giro di revisione Codex (21 novembre 2026)

Esito: **REVISE**, 2 rilievi (1 medium, 1 low). Accolti nella v07, conservando il comportamento di oggi.

| Rilievo                                                     | Correzione nella v07                                                                                                  |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| RV6-01, `trace_id=A;Sampled=1` con un X-Ray B nel messaggio | con `field-or-message` il campo vale solo come id diretto o header con `Root=`, come oggi; il messaggio decide (§3.3) |
| RV6-02, `apigw.TraceIdCandidateMatch` di toolkits/send      | il tipo resta esportato da `service` e `apigw`; cambia solo il percorso dei re-export (§3.1)                          |

## Settimo giro di revisione Codex (21 novembre 2026)

Esito: **REVISE**, 2 rilievi medium. RV7-01 accolto nella v08 togliendo una regola, RV7-02 dichiarato fuori.

| Rilievo                                            | Esito nella v08                                                                                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RV7-01, `A;Root=B` nei campi applicativi           | `canonicalTraceId` tiene la regola di oggi per ogni chiamante; il pattern del profilo SEND diventa `Root=([^;\s]+)` e sostituisce lo `split(';')` dei due step (§3.2) |
| RV7-02, step di finestra con identificatori opachi | fuori: l'unico uso dello step legge il trace X-Ray SEND; nessun runbook lo configura con un `cid` (§5)                                                                |

## Ottavo giro di revisione Codex (21 novembre 2026)

Esito: **REVISE**, 2 rilievi medium, entrambi dichiarati fuori nella v09.

| Rilievo                                                                  | Esito nella v09                                                                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| RV8-01, `xrayTraceId=A;Sampled=1` senza `Root=`                          | fuori: il campo SEND inizia sempre con `Root=`; il valore sta solo in una fixture scritta per lo `split(';')` (§5) |
| RV8-02, `Root=legacy-id;Sampled=1` e corrispondenza esatta in Watchtower | fuori, con RV3-02: un trace non valido non è un trace; il valore sta solo nelle fixture (§5)                       |

## Valutazione dei rilievi e scelta del committente (21 novembre 2026)

Il committente chiede se i rilievi accolti abbiano snaturato l'obiettivo. La valutazione: i rilievi RL-02, RL-03,
RL-04, RV4-02, RV5-01, RV5-03 e RV6-02 erano fondati; RV3-02, RV5-02, RV6-01, RV7-01, RV7-02 e i due dell'ottavo
giro riguardavano valori che i log reali non producono. Accoglierli tornando al comportamento di oggi aveva tolto due
pezzi dell'obiettivo: la regola unica di appartenenza delle righe (v03, su RV2-03) e il ripiego unico dei due step
SEND (v04, su RV3-02).

Il committente sceglie di recuperarli. La v09 applica la regola unica alle query standard, lasciando `rowsOfTraces`
alle query dell'autore, e dà ai due step SEND lo stesso ripiego.

## Nono giro di revisione Codex (21 novembre 2026)

Perimetro stretto: solo regressioni con dati reali delle due modifiche della v09. Esito: **REVISE**, 1 rilievo
medium, accolto nel merito con una correzione diversa da quella proposta.

| Rilievo                                         | Esito nella v10                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RV9-01, template di `pn-mandate` con due regole | il fatto è corretto: `pn-mandate` ha un `traceQueryOverride` con il predicato standard, letto per lotti fino a 50. Codex proponeva di tenerlo su `rowsOfTraces`; la v10 sceglie invece il filtro con `readsTraceBatches`, lo stesso criterio che oggi decide lotti e attribuzione, e `pn-mandate` usa la regola unica: proietta `@message` e `trace_id` e la sua attribuzione usa già il matcher (§3.4, §5) |

## Approvazione (21 novembre 2026)

Il committente approva la **v10** dopo il nono giro di revisione Codex. Lo sviluppo parte dalla v10.

## Sviluppo (21 novembre 2026)

Stato di partenza: build verde, 1191 test di go-runbook verdi.

**Module dei trace id** (`packages/go-runbook/src/toolkits/common/parsing/traceIds`):

- `transformRawTraceId` diventa `bareTraceId`, in minuscolo, usato solo dentro il module; `canonicalTraceId` toglie
  gli spazi ai bordi e tiene la regola di oggi (id diretto o `Root=`).
- `traceRowMatcher` (con `TraceRowMatcherFn`): la regola di appartenenza delle righe, con le forme canoniche calcolate
  una volta.
- `matchTraceIdCandidate`, `TraceIdCandidateMatch` e `TraceIdSearchPolicy` passano qui da `applicationLogs/`; il
  `canonical` è sempre minuscolo, la policy `field` usa `bareTraceId`.

**Chiamanti**: `attributeTraceRow` e `attributeServiceRow` usano il matcher; `serviceRowMatcher` (con
`ServiceRowMatcherFn`) applica la regola di `attributeServiceRow` a un lotto. `ServiceTraceLevelReader` filtra con il
matcher le letture per lotti (`readsTraceBatches`) e con `rowsOfTraces` quelle di un trace per volta;
`ServiceLogsLevelReader` filtra con `serviceRowMatcher`. `DescendToServiceStep` ed `enumerateApiGwRequests` chiamano
`canonicalTraceId` senza `split(';')`, con lo stesso ripiego; il profilo SEND estrae `Root=([^;\s]+)`.
`QueryServiceLogsStep` cerca le forme di `traceIdForms` in `OR` e filtra con `rowsOfTraces`.

**go-watchtower-runbook**: `DetectedCase.traceIds` porta i valori delle osservazioni `traceId` (un campo accanto a
`identifiers`, con lo stesso effetto del tipo per identificatore della v10 e meno modifiche); `analysisTraceMatcher`
(con `IdentifierMatcherFn`) confronta senza maiuscolo ogni identificatore e per forma canonica solo i trace;
`bestComparison` e `pickTrackingExcerpt` lo usano. `CACHE_FINGERPRINT_VERSION` passa a 16.

**API pubblica**: esce `apigw.transformRawTraceId`, entra `canonicalTraceId` in `toolkits/common`;
`TraceIdCandidateMatch` resta in `service` e `apigw`. Changeset `trace-identity` (major, prerelease `next`); API
report rigenerati.

**Test**: nuovi `bareTraceId`, `traceRowMatcher`, `enumerateApiGwRequests`, `serviceLogRows` (candidati discordanti
del secondo tentativo), `traceIdentityMatch` di go-watchtower-runbook; aggiornati `canonicalTraceId`,
`matchTraceIdCandidate`, i due lettori (lotto singolo, query di un trace per volta), `extractTraceId` (header SEND con
altri campi), `QueryServiceLogsStep` (tre forme, righe di un altro trace, fallback UUID), `DescendToServiceStep`,
la cache. Le fixture di `createSendApiGwAlarmRunbook` e dei runbook IO_EXP e NotificationReceived WEB restituivano,
per una lettura per trace, righe senza `trace_id` e senza il trace nel messaggio, possibili solo perché il finto
CloudWatch ignora il predicato: ora portano il `trace_id` che i servizi SEND scrivono.

**Documentazione**: `docs/RUNBOOKENGINE.md` (attribuzione del livello di servizio, paragrafo «Il trace id»). I
commenti di `extractTraceId.ts` e `AccessLogSchema.ts` citano ancora il pattern `Root=([^\s]+)`: non toccati.

**Verifica** (21 novembre 2026): `pnpm check` verde (build, test con 1207 test di go-runbook e 58 di
go-watchtower-runbook, coverage, published, lint, format, unused, dependencies, duplicates, types, scaffold,
new-classes, workflows, shell). I due warning di lint restano quelli preesistenti di go-send.
