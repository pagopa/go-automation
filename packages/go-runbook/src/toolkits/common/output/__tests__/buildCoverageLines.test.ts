import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildCoverageLines } from '../buildCoverageLines.js';
import { treeResult } from '../tree/__tests__/errorTreeFixture.js';

describe('buildCoverageLines', () => {
  it('counts each unrecognized leaf once and the interrupted chains with the words of the chain lines', () => {
    assert.deepEqual(buildCoverageLines(treeResult()), [
      'Errori senza caso noto: 1 (errori in fondo a una catena che nessun caso noto riconosce)',
      'Catene interrotte: 2 (non interrogato, identificatore mancante 1, ciclo 1)',
    ]);
  });

  it('reports the unexamined errors and the incomplete sources of a window', () => {
    assert.deepEqual(
      buildCoverageLines({
        coverage: [
          { stepId: 'q', complete: false, reason: 'saturated' },
          { stepId: 'r', complete: false },
        ],
        observedErrors: { unit: 'request', observed: 5, examined: 3, lowerBound: true },
      }),
      ['Non esaminati: almeno 2 richieste', 'Evidenza incompleta: 2 fonti (sature 1, non disponibili 1)'],
    );
  });
});
