import { ZONES } from './zones.js';

/**
 * Sprawdza strukturalne inwarianty GameState. Funkcja nie naprawia stanu —
 * wykrycie naruszenia jest błędem programistycznym engine.
 */
export function assertStateInvariants(state) {
  if (!state || !(state.objects instanceof Map) || !state.zones) {
    throw new TypeError('Nieprawidłowy GameState');
  }
  const seen = new Set();
  for (const zone of ZONES) {
    if (!Array.isArray(state.zones[zone])) throw new Error(`Strefa ${zone} nie jest tablicą`);
    for (const id of state.zones[zone]) {
      if (seen.has(id)) throw new Error(`Obiekt ${id} występuje w więcej niż jednej strefie`);
      seen.add(id);
      const object = state.objects.get(id);
      if (!object) throw new Error(`Strefa ${zone} wskazuje na nieistniejący obiekt ${id}`);
      if (object.id !== id || object.zone !== zone) throw new Error(`Niespójny obiekt ${id} w strefie ${zone}`);
    }
  }
  for (const [id, object] of state.objects) {
    if (id !== object.id || !seen.has(id)) throw new Error(`Obiekt ${id} nie jest w żadnej strefie`);
    if (!state.players.some((player) => player.id === object.controllerId)) {
      throw new Error(`Obiekt ${id} ma nieznanego kontrolera`);
    }
    // Załącznik (aura albo equipment): relacja obustronnie spójna — aura
    // (kind 'aura', nie jest wtedy stworem) albo equipment (artefakt z
    // deskryptorem equipment) wskazuje istniejącego gospodarza, różnego od
    // siebie. Gospodarz „ilegalny" (np. przestał być stworem) rozdziela SBA
    // po komendzie; brak gospodarza w ogóle to już błąd programistyczny.
    if (object.attachedTo != null) {
      if (object.kind !== 'aura' && !object.equipment) {
        throw new Error(`Obiekt ${id} ma attachedTo, nie będąc aurą ani equipmentem`);
      }
      const host = state.objects.get(object.attachedTo);
      if (!host) throw new Error(`Załącznik ${id} wskazuje nieistniejącego gospodarza ${object.attachedTo}`);
      if (host.id === object.id) throw new Error(`Załącznik ${id} nie może być gospodarzem samego siebie`);
    }
  }
  if (state.combat) {
    const refs = [...state.combat.attackers, ...[...state.combat.blockers.values()].flat()];
    for (const id of refs) {
      const object = state.objects.get(id);
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') {
        throw new Error(`Combat odwołuje się do nieistniejącego stwora ${id}`);
      }
    }
    if (!state.players.some((player) => player.id === state.combat.attackingPlayerId)) {
      throw new Error('Combat ma nieznanego atakującego gracza');
    }
  }
  if (state.pendingScry) {
    if (!state.players.some((player) => player.id === state.pendingScry.playerId)) {
      throw new Error('Pending scry ma nieznanego gracza');
    }
    for (const id of state.pendingScry.objectIds) {
      const object = state.objects.get(id);
      if (!object || object.zone !== 'library' || object.controllerId !== state.pendingScry.playerId) {
        throw new Error(`Pending scry odwołuje się do obcej karty ${id}`);
      }
    }
  }
  for (const pending of state.pendingBackups ?? []) {
    if (!state.players.some((player) => player.id === pending.playerId)) {
      throw new Error('Pending backup ma nieznanego gracza');
    }
    if (!state.objects.has(pending.sourceId)) {
      throw new Error(`Pending backup odwołuje się do nieistniejącego źródła ${pending.sourceId}`);
    }
  }
  return true;
}
