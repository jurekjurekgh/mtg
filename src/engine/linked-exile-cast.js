/**
 * Uprawnienie „You may cast this card for as long as it remains exiled”
 * utworzone przez rozstrzygniętą zdolność (CR 601.3 / 611.2).
 *
 * Pole żyje na KONKRETNYM obiekcie w exile. Każda zmiana strefy tworzy nowy
 * obiekt (CR 400.7), więc moveObjectDirectly czyści pieczęć. Powiązane granty
 * na permanentach mają osobny czas trwania: znikają wyłącznie wtedy, gdy ten
 * dokładny obiekt zostanie rzucony z exile; samo opuszczenie exile nie kończy
 * ich (ruling SNC 2022-04-29 dla tej rodziny efektów).
 */
export const LINKED_EXILE_CAST_DURATION = 'until_source_cast_from_exile';

export function linkedExileCastPermission(playerId) {
  if (!playerId) throw new TypeError('Pozwolenie rzutu z exile wymaga gracza');
  return Object.freeze({ playerId });
}

export function canCastByLinkedExilePermission(object, playerId) {
  return Boolean(playerId
    && object
    && object.zone === 'exile'
    && object.linkedExileCastPermission?.playerId === playerId);
}

/** Patch CR 400.7 — używany wyłącznie przy opuszczaniu exile. */
export function clearLinkedExileCastPermission(object) {
  return object?.linkedExileCastPermission != null
    ? { linkedExileCastPermission: null }
    : {};
}

/**
 * Rzut linkowanego obiektu kończy dokładnie granty związane z jego starym id.
 * Funkcja jest bez zależności od permanents.js, by centralny mover stref nie
 * tworzył cyklu modułów.
 */
export function consumeGrantsLinkedToExileCast(state, linkedSourceId) {
  if (!state || !linkedSourceId) return;
  for (const id of state.zones.battlefield ?? []) {
    const object = state.objects.get(id);
    if (!object) continue;
    const grants = object.abilityGrants ?? [];
    const kept = grants.filter((ability) => !(
      ability?.grantDuration === LINKED_EXILE_CAST_DURATION
      && ability?.linkedSourceId === linkedSourceId
    ));
    if (kept.length === grants.length) continue;
    state.objects.set(id, Object.freeze({
      ...object,
      abilityGrants: Object.freeze(kept),
    }));
  }
}

export function isLinkedExileCastGrant(ability) {
  return ability?.grantDuration === LINKED_EXILE_CAST_DURATION
    && typeof ability?.linkedSourceId === 'string';
}
