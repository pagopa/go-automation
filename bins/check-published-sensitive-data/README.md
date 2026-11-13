# check-published-sensitive-data

Gate di EVO-AWSACCT-OPUS-01 §9: nei package pubblicati (`packages/*` con nome `@pagopa/*` e non `private`) non devono finire account id AWS, ARN con account o nomi di profilo AWS.

| Comando                        | Gate    | Cosa controlla                                                                                                                                  |
| ------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check:published`         | G-pub-1 | Esegue `pnpm pack` di ogni package (quindi `prepack`: `clean` + `build`), estrae l'archivio e ispeziona ogni file di testo e l'elenco dei file. |
| `pnpm check:published:sources` | G-pub-2 | Ispeziona `src/**` (esclusi test e `__baseline__`), `README.md` e `CHANGELOG.md`, senza build. È un passo di `pnpm lint`.                       |
| `pnpm check:published:test`    | —       | Test del bin, compreso il package esca che deve far fallire G-pub-1 e G-pub-2.                                                                  |

G-pub-3 è la regola ESLint `no-restricted-syntax` sui letterali di 12 cifre nei sorgenti pubblicati (`eslint.config.mjs`).

## Regole

Le regole sono in `published-sensitive-data.config.json`, alla radice del repo privato (non viene pubblicato):

- **account id:** 12 cifre esatte; `allowedAccountIds` ammette solo id sintetici, ognuno con una motivazione;
- **ARN con account:** `arn:aws…:<servizio>:<regione>:<12 cifre>:`, salvo account ammessi;
- **nomi di profilo:** `profileNames` (nomi reali noti, token interi) e `profilePrefixes` (prefissi di credenziali SSO, `sso_`);
- **voci vietate nell'archivio:** segmenti `__tests__` e `__baseline__`, suffisso `.tsbuildinfo`;
- **eccezioni:** `exceptions`, per file pubblicato e valore, con una motivazione obbligatoria.

I nomi dei permission set non sono vietati.

## Esito

- Codice 0: nessun dato sensibile.
- Codice 1: almeno un finding. Ogni riga riporta package, file, riga e regola, con il valore **mascherato**: il log della CI non deve ripubblicarlo.
- Codice 2: errore di configurazione o di packaging.
