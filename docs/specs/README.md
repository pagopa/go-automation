# Specifiche

Le specifiche descrivono un lavoro prima di farlo: perché serve, che cosa cambia, che cosa resta fuori e le scelte
che spettano al committente. Si scrivono, si rivedono e si approvano prima dello sviluppo; il registro delle
revisioni racconta poi come sono andati revisione, sviluppo e verifica.

## Struttura

Ogni specifica ha la sua cartella, chiamata con il prefisso dei suoi file:

```
docs/specs/
└── SPEC-001-GitHubWorkflows/
    ├── SPEC-001-GitHubWorkflows-CLAUDE-v01.md
    ├── SPEC-001-GitHubWorkflows-CLAUDE-v02.md
    └── SPEC-001-GitHubWorkflows-REVIEW-LOG.md
```

- **Nome**: `SPEC-<NNN>-<Argomento>`, con il numero a tre cifre progressivo e l'argomento in PascalCase.
- **File di una versione**: `SPEC-<NNN>-<Argomento>-<AUTORE>-v<NN>.md`. L'autore è chi l'ha scritta (`CLAUDE`,
  `CODEX`, `COPILOT`, …); la versione è a due cifre.
- **Una versione nuova, o la proposta di un altro autore, è un file nuovo** nella stessa cartella: le versioni
  precedenti non si modificano.
- **Registro**: `SPEC-<NNN>-<Argomento>-REVIEW-LOG.md` raccoglie, in ordine, le scelte del committente, le versioni
  con il loro SHA256, i giri di revisione con l'esito e i rilievi, l'approvazione, lo sviluppo e la verifica.
- Altri documenti della specifica (una revisione del codice, un elenco di anomalie) stanno nella stessa cartella,
  con lo stesso prefisso: `SPEC-<NNN>-<Argomento>-CODE-REVIEW-<data>.md`.

## Forma di una versione

L'intestazione dice lo stato (bozza, approvata, completata), l'autore e l'origine della richiesta. Le sezioni
seguono, dove servono, quest'ordine:

1. **Perché**: il problema, con i fatti e le misure.
2. **Che cosa vede chi usa** il repository (sviluppatori, revisori, chi rilascia).
3. **La proposta**, divisa per argomento.
4. **Test e verifica**: come si prova che il lavoro è fatto.
5. **Fuori da questa specifica**: ciò che si è valutato e scartato, o rimandato, con il motivo.
6. **Le scelte del committente**: le decisioni aperte, numerate `D1`, `D2`, …, con la proposta dell'autore. Le
   versioni successive riportano la risposta e la data.

## Regole

- Le specifiche si citano solo nei documenti di `docs/`: mai nel codice, nei commenti, nei test, nei workflow, nei
  changeset o nei messaggi di commit. Il codice spiega sé stesso; la storia di una scelta sta nella specifica.
- Una specifica non contiene segreti, account id AWS reali o nomi di profilo: vale la regola dei package pubblicati
  (vedi `CLAUDE.md`).
- I documenti di `docs/evolutions/` restano come archivio storico; i lavori nuovi aprono una specifica qui.
