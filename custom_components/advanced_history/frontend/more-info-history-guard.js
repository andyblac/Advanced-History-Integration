const HISTORY_UPDATE_GUARD = "__advancedHistoryMoreInfoHistoryUpdateGuard";

export function installMoreInfoHistoryUpdateGuard(card) {
  if (
    !card
    || typeof card._updateHistory !== "function"
    || card[HISTORY_UPDATE_GUARD]
  ) return false;

  const originalUpdateHistory = card._updateHistory;
  const guard = {
    committedGraphData: card._graphData,
    originalUpdateHistory,
  };
  card[HISTORY_UPDATE_GUARD] = guard;

  card._updateHistory = async function (...args) {
    const update = originalUpdateHistory.apply(this, args);
    const sequence = this._updateSeq;
    try {
      return await update;
    } finally {
      if (this[HISTORY_UPDATE_GUARD] !== guard) return;
      if (sequence === this._updateSeq) {
        guard.committedGraphData = this._graphData;
      } else {
        // SGCC currently assigns _graphData before checking _updateSeq. A
        // slower, obsolete date request can therefore replace the newest
        // dataset even though SGCC correctly skips drawing that response.
        this._graphData = guard.committedGraphData;
      }
    }
  };
  return true;
}
