---
'@pagopa/go-runbook': patch
---

L'output e la bozza d'analisi leggono l'albero d'errore da una sola vista, costruita una volta per output.

- La riga di copertura delle catene interrotte usa gli stessi testi della riga della catena: un'interruzione `skipped` si legge «non interrogato, identificatore mancante». La copertura strutturata (`coverage.interruptions`, `coverage.levels`) non cambia.
- Le osservazioni di una detection (`outcome.detections[].observations`) hanno, per ogni valore, l'osservazione più vecchia fra quelle della detection e la correlazione del suo nodo e dei suoi antenati, in ordine di tempo.
