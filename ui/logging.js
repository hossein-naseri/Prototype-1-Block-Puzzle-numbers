const STORAGE_KEY = 'operatorBlocks:sessions';

function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveSessions(sessions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    /* storage full or unavailable; drop silently, this is playtest logging */
  }
}

function handComposition(hand) {
  return hand.map((block) => ({
    id: block.id,
    shapeId: block.shapeId,
    ops: block.cells.map((c) => c.op),
  }));
}

export function createLogger(variantName, seed) {
  const session = {
    variant: variantName,
    seed,
    startedAt: Date.now(),
    endedAt: null,
    finalScore: 0,
    turnsSurvived: 0,
    placements: [],
    illegalAttempts: [],
  };
  let ended = false;

  function logPlacement(prevState, result) {
    session.placements.push({
      turn: prevState.turns,
      offeredHand: handComposition(prevState.hand),
      chosenBlockId: result.placement.block.id,
      chosenShapeId: result.placement.block.shapeId,
      chosenOps: result.placement.block.cells.map((c) => c.op),
      anchor: { r: result.placement.absCells[0].r, c: result.placement.absCells[0].c },
      scoreDelta: result.scoreDelta,
    });
  }

  function logIllegalAttempt(prevState, blockId, r, c) {
    const block = prevState.hand.find((b) => b.id === blockId);
    session.illegalAttempts.push({
      turn: prevState.turns,
      blockId,
      shapeId: block ? block.shapeId : null,
      ops: block ? block.cells.map((c2) => c2.op) : [],
      anchor: { r, c },
      at: Date.now(),
    });
  }

  function endSession(state) {
    if (ended) return;
    ended = true;
    session.endedAt = Date.now();
    session.finalScore = state.score;
    session.turnsSurvived = state.turns;
    session.sessionLengthMs = session.endedAt - session.startedAt;
    const sessions = loadSessions();
    sessions.push(session);
    saveSessions(sessions);
  }

  return { logPlacement, logIllegalAttempt, endSession };
}

createLogger.exportAll = function exportAll() {
  const sessions = loadSessions();
  const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `operator-blocks-log-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
