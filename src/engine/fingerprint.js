/**
 * Stabilna, czytelna reprezentacja stanu do porównywania replayów.
 * Nie jest mechanizmem bezpieczeństwa ani skrótem kryptograficznym.
 */
export function stateFingerprint(state) {
  const objects = [...state.objects.values()]
    .map(({ id, instanceId, cardId, controllerId, zone }) => ({ id, instanceId, cardId, controllerId, zone }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const zones = Object.fromEntries(Object.entries(state.zones).map(([zone, ids]) => [zone, [...ids]]));
  return JSON.stringify({
    seed: state.seed,
    status: state.status,
    winnerId: state.winnerId,
    players: state.players,
    turn: state.turn,
    zones,
    objects,
  });
}
