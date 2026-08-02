import { event } from '../protocol/types.js';
import { markDamage, modifyStats, turnFaceUp } from './permanents.js';
import { addCounter, removeCounter } from './counters.js';
import { changeLife } from './players.js';
import { spendMana, addMana } from './resources.js';
import { moveObjectDirectly } from './objects.js';
import { createBattlefieldToken } from './tokens.js';

/**
 * Wspólny interpreter efektów dla czarów i zdolności aktywowanych.
 * Deskryptor efektu (typ + parametry) buduje warstwa kart; core zna wyłącznie
 * ogólne typy: damage, pump, create_token. Efekty zapisują swoje zdarzenia
 * wprost do `state.events` (jak dotąd robiły to w spells.js), więc są widoczne
 * w logu i strumieniu rozstrzygania.
 *
 * @param {object} state
 * @param {{type: string, [k: string]: unknown}} effect
 * @param {object} sourceObject obiekt źródła (kontroler tokenów/obrażeń)
 * @param {string[]} targets id celów (dla damage/pump pierwszy cel)
 */
export function applyEffect(state, effect, sourceObject, targets = []) {
  if (effect.type === 'damage') {
    const targetId = targets[0];
    if (!Number.isInteger(effect.amount) || effect.amount < 0) throw new RangeError('Obrażenia muszą być nieujemne');
    const damage = event('damage_dealt', { source: sourceObject.id, target: targetId, amount: effect.amount });
    state.events.push(damage);
    markDamage(state, targetId, effect.amount);
    return;
  }
  if (effect.type === 'pump') {
    // Trigger bez jawnych celów (np. landfall) pumpuje samo źródło.
    const targetId = targets[0] ?? sourceObject.id;
    modifyStats(state, targetId, { power: effect.power ?? 0, toughness: effect.toughness ?? 0 });
    return;
  }
  if (effect.type === 'create_token') {
    createBattlefieldToken(state, sourceObject.controllerId, {
      cardId: effect.cardId,
      name: effect.name,
      kind: effect.kind ?? 'creature',
      power: effect.power ?? 1,
      toughness: effect.toughness ?? 1,
      colors: effect.colors ?? [],
    });
    return;
  }
  if (effect.type === 'gain_life') {
    if (!Number.isInteger(effect.amount) || effect.amount < 0) throw new RangeError('Zysk życia musi być nieujemny');
    changeLife(state, sourceObject.controllerId, effect.amount);
    return;
  }
  if (effect.type === 'add_counter') {
    addCounter(state, sourceObject.id, effect.counter, effect.amount ?? 1);
    return;
  }
  if (effect.type === 'remove_counter') {
    removeCounter(state, sourceObject.id, effect.counter, effect.amount ?? 1);
    return;
  }
  if (effect.type === 'tap_permanent') {
    const targetId = targets[0];
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') throw new Error('Nieprawidłowy cel tapa');
    if (!object.tapped) {
      const updated = Object.freeze({ ...object, tapped: true });
      state.objects.set(targetId, updated);
      state.events.push(event('object_tapped', { objectId: targetId, playerId: sourceObject.controllerId }));
    }
    return;
  }
  if (effect.type === 'lock_untap') {
    // Stwór nie odkręca się, dopóki źródło (np. zatapnięta Lira) jest na
    // bitwisku i zatapnięte; blokada wygasa, gdy źródło opuści bitwisko.
    const targetId = targets[0];
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') throw new Error('Nieprawidłowy cel blokady');
    const lockedBy = [...(object.untapLockedBy ?? [])];
    if (!lockedBy.includes(sourceObject.id)) lockedBy.push(sourceObject.id);
    state.objects.set(targetId, Object.freeze({ ...object, untapLockedBy: lockedBy }));
    return;
  }
  if (effect.type === 'untap_permanent') {
    // Odkręcenie permanentu — domyślnie źródła (np. trigger Midnight Guard:
    // „Whenever another creature enters, untap this creature").
    const targetId = targets[0] ?? sourceObject.id;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') throw new Error('Nieprawidłowy cel odkręcenia');
    if (object.tapped) {
      state.objects.set(targetId, Object.freeze({ ...object, tapped: false }));
      state.events.push(event('object_untapped', { objectId: targetId, playerId: sourceObject.controllerId }));
    }
    return;
  }
  if (effect.type === 'add_mana') {
    // Dodanie many do puli (Holdout Settlement: „Add one mana of any color" —
    // pula engine jest bezbarwna, więc dowolny kolor = 1 bezbarwna).
    addMana(state, sourceObject.controllerId, effect.amount ?? 1);
    return;
  }
  if (effect.type === 'pay_life') {
    if (!Number.isInteger(effect.amount) || effect.amount < 1) throw new RangeError('Płatność życia musi być dodatnia');
    changeLife(state, sourceObject.controllerId, -effect.amount);
    return;
  }
  if (effect.type === 'pay_mana') {
    spendMana(state, sourceObject.controllerId, effect.amount ?? 0);
    return;
  }
  if (effect.type === 'return_permanent_from_graveyard') {
    const targetId = targets[0];
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'graveyard' || object.kind === 'land' || object.kind === 'spell') {
      throw new Error('Nieprawidłowy cel powrotu z grobu');
    }
    const newId = `permanent-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'battlefield', newId);
    const permanent = Object.freeze({ ...moved, summoningSickness: true });
    state.objects.set(newId, permanent);
    if (effect.finalityCounter) addCounter(state, newId, 'finality', 1);
    state.events.push(event('object_moved', { fromId: targetId, object: permanent, fromZone: 'graveyard', toZone: 'battlefield' }));
    return;
  }
  if (effect.type === 'transform') {
    const target = sourceObject.transformTo;
    if (!target) throw new Error('Ta karta nie ma drugiej strony (transform)');
    const updated = Object.freeze({
      ...sourceObject,
      cardId: target.cardId,
      power: target.power,
      toughness: target.toughness,
      abilities: target.abilities,
      keywords: target.keywords ?? [],
      subtypes: target.subtypes ?? [],
      transformTo: {
        cardId: sourceObject.cardId,
        power: sourceObject.power,
        toughness: sourceObject.toughness,
        abilities: sourceObject.abilities,
        keywords: sourceObject.keywords ?? [],
        subtypes: sourceObject.subtypes ?? [],
      },
    });
    state.objects.set(sourceObject.id, updated);
    state.events.push(event('object_transformed', { objectId: sourceObject.id, fromCardId: sourceObject.cardId, cardId: target.cardId }));
    return;
  }
  if (effect.type === 'exile_permanent') {
    const targetId = targets[0];
    if (!targetId) throw new Error('exile_permanent wymaga celu');
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') throw new Error('Nieprawidłowy cel wygnania');
    const exileId = `exile-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'exile', exileId);
    state.events.push(event('object_moved', { fromId: targetId, object: moved, fromZone: 'battlefield', toZone: 'exile' }));
    return;
  }
  if (effect.type === 'sacrifice_permanent') {
    // Poświęcenie permanentu: domyślnie samo źródło („sacrifice it"), z
    // możliwością wskazania celu przez targets[0]. Trafia do grobu (nie exile).
    const targetId = targets[0] ?? sourceObject.id;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') throw new Error('Nieprawidłowy cel poświęcenia');
    const graveId = `grave-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, object.id, 'graveyard', graveId);
    state.events.push(event('permanent_sacrificed', { fromId: object.id, objectId: graveId, playerId: object.controllerId, cardId: moved.cardId }));
    return;
  }
  if (effect.type === 'scry') {
    // Scry N (CR 701.18, minimalny wymiar — pierwsza karta to Prismari Campus):
    // patrzymy na N wierzchnich kart własnej biblioteki; decyzję o spodzie
    // podejmuje gracz osobną komendą resolve_scry (patrz game-state.js).
    if (!Number.isInteger(effect.amount) || effect.amount < 1) throw new RangeError('Scry wymaga dodatniej liczby kart');
    const ownerId = sourceObject.controllerId;
    const seen = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === ownerId).slice(0, effect.amount);
    state.pendingScry = seen.length > 0 ? { playerId: ownerId, objectIds: seen } : null;
    state.events.push(event('scry_started', { playerId: ownerId, amount: seen.length }));
    return;
  }
  if (effect.type === 'turn_face_up') {
    turnFaceUp(state, sourceObject.id, effect.counters ?? {});
    return;
  }
  throw new Error(`Nieznany typ efektu: ${effect.type}`);
}
