---
'@pagopa/go-common': patch
---

- `GOTableFormatter` con `border: false`: le righe non hanno più i bordi esterni `│`, così i separatori `┼` sono allineati ai `│` tra le celle (prima erano spostati di una colonna). Gli stili con bordo e `compact` non cambiano.
- `GOJSONFormatDetector`: l'estensione si legge solo dal nome del file. Un punto in una directory (`.cache/data`, `exports.v2/data`) non viene più riportato come estensione nei `details`; il formato rilevato non cambia.
