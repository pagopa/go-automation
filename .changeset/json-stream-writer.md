---
'@pagopa/go-common': minor
---

`GOJSONStreamWriter` (`@pagopa/go-common/exporters`) scrive un valore su uno stream come JSON, a pezzi, con lo stesso testo di `JSON.stringify` e rispettando la backpressure. `GOJSONFileExporter` lo usa: un valore il cui testo non sta in una stringa (per esempio la traccia di un'esecuzione con migliaia di step) si scrive senza `Invalid string length`; il file si scrive in un temporaneo nella stessa cartella e prende il nome finale solo quando è completo, quindi un'esportazione fallita lascia il file precedente com'era.
