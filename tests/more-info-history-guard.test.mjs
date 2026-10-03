import assert from "node:assert/strict";
import test from "node:test";

import {
  installMoreInfoHistoryUpdateGuard,
} from "../custom_components/advanced_history/frontend/more-info-history-guard.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("More Info keeps the newest graph data when an older request finishes last", async () => {
  const requests = [];
  const card = {
    _graphData: { period: "initial" },
    _updateSeq: 0,
    async _updateHistory(period) {
      const sequence = ++this._updateSeq;
      const completion = deferred();
      requests.push({ completion, period, sequence });
      await completion.promise;
      // This mirrors SGCC's current ordering: graph data is assigned before
      // its stale update sequence check.
      this._graphData = { period };
      if (sequence !== this._updateSeq) return;
    },
  };

  assert.equal(installMoreInfoHistoryUpdateGuard(card), true);
  const july = card._updateHistory("July");
  const september = card._updateHistory("September");

  requests[1].completion.resolve();
  await september;
  assert.deepEqual(card._graphData, { period: "September" });

  requests[0].completion.resolve();
  await july;
  assert.deepEqual(card._graphData, { period: "September" });
});

test("More Info history guard is installed only once", () => {
  const card = { _updateHistory: async () => {} };

  assert.equal(installMoreInfoHistoryUpdateGuard(card), true);
  const guardedUpdate = card._updateHistory;
  assert.equal(installMoreInfoHistoryUpdateGuard(card), false);
  assert.equal(card._updateHistory, guardedUpdate);
});
