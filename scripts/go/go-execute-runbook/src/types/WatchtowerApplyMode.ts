/**
 * Modi lanciabili in v1. `APPLY_ALL` è deliberatamente assente: Watchtower non
 * lo accetta più sulle rotte di creazione (§4.5), quindi il tipo lo esclude e
 * l'errore arriva alla lettura del flag invece che da un 400 a valle.
 */
export type WatchtowerApplyMode = 'SHADOW' | 'APPLY_KNOWN';
