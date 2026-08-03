import { event } from '../protocol/types.js';
import { moveObjectDirectly } from './objects.js';
import { untapControlled } from './permanents.js';
import { addCounter } from './counters.js';
import { changeLife } from './players.js';

/** Idempotentna inicjalizacja zasobów; createGameState wykonuje ją automatycznie. */
export function initializeResources(state) {
  for (const player of state.players) {
    player.mana = 0;
    player.landPlays = 1;
  }
  return state;
}

export function addMana(state, playerId, amount) {
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Mana musi być nieujemną liczbą całkowitą');
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) throw new Error('Nieznany gracz');
  player.mana += amount;
  const e = event('mana_changed', { playerId, amount, total: player.mana });
  state.events.push(e);
  return e;
}

export function spendMana(state, playerId, amount) {
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Koszt many musi być nieujemną liczbą całkowitą');
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player || (player.mana ?? 0) < amount) throw new Error('Niewystarczająca mana');
  player.mana -= amount;
  const e = event('mana_changed', { playerId, amount: -amount, total: player.mana });
  state.events.push(e);
  return e;
}

export function resetTurnResources(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) throw new Error('Nieznany gracz');
  player.mana = 0;
  player.landPlays = 1;
  return player;
}

export function beginTurn(state, playerId) {
  const player = resetTurnResources(state, playerId);
  const before = state.events.length;
  const untapped = untapControlled(state, playerId);
  state.events.push(event('turn_started', { playerId, untapped: untapped.map((object) => object.id) }));
  // Zdarzenia zagnieżdżone (odkręcenia + start tury) wracają do wywołującego,
  // żeby trafiły do strumienia wynikowego komendy, nie tylko do state.events.
  return { player, untapped, events: state.events.slice(before) };
}

export function tapLandForMana(state, playerId, objectId) {
  const object = state.objects.get(objectId);
  // Źródłem many jest land albo land creature (typ Land — token Forest Dryad).
  const isLandSource = object?.kind === 'land' || (object?.types ?? []).includes('Land');
  if (!object || object.zone !== 'battlefield' || object.controllerId !== playerId || !isLandSource) throw new Error('Nielegalne źródło many');
  if (object.tapped) throw new Error('Land jest już tapped');
  const updated = Object.freeze({ ...object, tapped: true });
  state.objects.set(objectId, updated);
  const mana = addMana(state, playerId, 1);
  const produced = event('mana_produced', { playerId, source: objectId, amount: 1 });
  state.events.push(produced);
  return [mana, produced];
}

export function castPermanent(state, playerId, objectId, { faceDown = false, phyrexianPayWithLife = 0 } = {}) {
  const player = state.players.find((entry) => entry.id === playerId);
  const object = state.objects.get(objectId);
  if (!player || !object || object.controllerId !== playerId || object.zone !== 'hand') throw new Error('Nielegalny permanent');
  if (object.kind !== 'creature' && object.kind !== 'artifact' && object.kind !== 'enchantment') throw new Error('Ten obiekt nie jest zagrywalnym permanentem');
  if (state.turn.activePlayerId !== playerId || !['precombat_main', 'postcombat_main'].includes(state.turn.phase)) throw new Error('Zagranie poza main phase');
  let cost = object.manaCost ?? 0;
  if (faceDown) {
    if (!object.morph || object.morph.cost == null) throw new Error('Ta karta nie może być zagrana twarzą w dół');
    cost = object.morph.cost;
  }
  // Phyrexian mana (CR 118.9): każdy symbol {W/P} można opłacić maną ({W})
  // albo 2 życiem — wybór NALEŻY DO GRACZA (parametr phyrexianPayWithLife
  // komendy cast_permanent; PlayerView wylicza wszystkie opłacalne warianty,
  // UI grupuje je w ChoiceRequest). Podstawa kosztu (tu {2}) zawsze z many.
  const phyrexian = object.phyrexianManaCost ?? 0;
  const lifePaid = phyrexian > 0 ? (phyrexianPayWithLife ?? 0) : 0;
  if (lifePaid < 0 || lifePaid > phyrexian) throw new Error('Nieprawidłowa liczba symboli phyrexian płaconych życiem');
  if (faceDown && lifePaid !== 0) throw new Error('Morph nie ma kosztu phyrexian');
  const totalMana = cost + (phyrexian - lifePaid);
  if ((player.mana ?? 0) < totalMana) throw new Error('Niewystarczająca mana');
  if (2 * lifePaid > (player.life ?? 0)) throw new Error('Niewystarczające życie');
  spendMana(state, playerId, totalMana);
  if (lifePaid > 0) changeLife(state, playerId, -2 * lifePaid);
  state.spellsCastThisTurn += 1;
  const newId = `permanent-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'battlefield', newId);
  const patch = { summoningSickness: true };
  if (faceDown) {
    // Face-down stwór: 2/2, bez nazwy/zdolności; megamorph dostaje zdolność
    // obrócenia twarzą do góry (deskryptor budowany bez importu abilities.js,
    // żeby nie tworzyć cyklu abilities -> resources -> abilities).
    patch.faceDown = true;
    patch.abilities = faceDownAbilities(object);
  }
  const permanent = Object.freeze({ ...moved, ...patch });
  state.objects.set(newId, permanent);
  const e = event('permanent_cast', {
    playerId, fromId: objectId, object: permanent, manaCost: cost, faceDown,
    // Fakt płatności phyrexian (jawny w logu: ile symboli opłacono życiem).
    phyrexianSymbols: phyrexian, phyrexianPaidWithLife: lifePaid,
    // Face-down permanent jest bezbarwny (CR 702.36) — nie jest „białym czarem".
    colors: faceDown ? [] : [...(object.colors ?? [])],
  });
  state.events.push(e);
  if (!faceDown && permanent.entersWithCounters) {
    for (const [name, amount] of Object.entries(permanent.entersWithCounters)) {
      addCounter(state, newId, name, amount);
    }
  }
  return e;
}

/**
 * Rzucenie karty bestow jako czaru AURY (CR 702.103): płaci alternatywny
 * koszt, obiekt ląduje na stosie z wybranym celem-stworem i deskryptorem
 * czaru aury. Rozstrzygnięcie obsługuje spells.resolveTopOfStack: przy
 * legalnym celu aura wchodzi załączona (nie jest stworem); przy nielegalnym —
 * kartę-rodzic wchodzi jako zwykły stwór (wyjątek bestow: czar aury z bestow
 * NIE idzie do grobu, gdy cel stanie się nielegalny).
 */
export function castAuraSpell(state, playerId, objectId, { targetId, bestow = false } = {}) {
  const player = state.players.find((entry) => entry.id === playerId);
  const object = state.objects.get(objectId);
  if (!player || !object || object.controllerId !== playerId || object.zone !== 'hand') throw new Error('Nielegalna karta aury');
  if (bestow && !object.bestow) throw new Error('Ta karta nie ma mechaniki bestow');
  if (!bestow && !object.aura) throw new Error('Tę kartę można rzucić jako aurę tylko za koszt bestow');
  if (state.turn.activePlayerId !== playerId || !['precombat_main', 'postcombat_main'].includes(state.turn.phase)) throw new Error('Czar aury tylko w swoją fazę main');
  if (state.zones.stack.length > 0) throw new Error('Czar aury tylko przy pustym stosie');
  // Czysta aura płaci zwykły koszt many; bestow — alternatywny koszt bestow.
  const cost = bestow ? (object.bestow.cost ?? 0) : (object.manaCost ?? 0);
  // Walidacja CELU PRZED jakąkolwiek mutacją (CR 601.2h): nieudany rzut nie
  // może zostawić karty na stosie ani utraconej many.
  let spellTargets;
  let enchantPlayer = false;
  if (object.enchantPlayer) {
    // Aura „Enchant player" (Curse of the Pierced Heart): celem jest gracz.
    if (!state.players.some((p) => p.id === targetId)) throw new Error('Celem czaru aury musi być gracz');
    spellTargets = Object.freeze([Object.freeze({ type: 'player' })]);
    enchantPlayer = true;
  } else {
    const host = state.objects.get(targetId);
    if (!host || host.zone !== 'battlefield' || host.kind !== 'creature') throw new Error('Celem czaru aury musi być stwór na bitwisku');
    spellTargets = Object.freeze([Object.freeze({ type: 'creature' })]);
  }
  spendMana(state, playerId, cost);
  state.spellsCastThisTurn += 1;
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  // Deskryptor czaru aury (jak czar): rozstrzygnięcie = wejście na bitwisko
  // załączone (albo — dla curse — z enchantedPlayerId).
  const stacked = Object.freeze({
    ...moved,
    tapped: false,
    enchantPlayer,
    chosenTargets: [targetId],
    spell: Object.freeze({
      timing: 'sorcery', aura: true, enchantPlayer,
      targets: spellTargets,
      effects: Object.freeze([Object.freeze({ type: enchantPlayer ? 'attach_aura_player' : 'attach_aura' })]),
    }),
  });
  state.objects.set(stackId, stacked);
  const e = event('aura_spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    manaCost: cost, targets: [targetId], bestow, enchantPlayer,
    // Kolory czaru aury (publiczne) — trigger „a player casts a white spell".
    colors: [...(object.colors ?? [])],
  });
  state.events.push(e);
  return e;
}

/**
 * Warianty rzucenia aury (karta w ręce × legalny cel-stwór na bitwisku).
 * Cel to DOWOLNY stwór („enchant creature" bez ograniczenia kontrolera).
 * Karty z bestow dają warianty bestow:true; czyste aury — warianty zwykłe
 * (bestow:false, koszt many karty). Aury wymagają celu już przy rzuceniu
 * (CR 601.2c) — bez stwora na bitwisku nie da się jej w ogóle rzucić.
 */
export function legalAuraCasts(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  const out = [];
  if (!player) return out;
  for (const id of state.zones.hand) {
    const object = state.objects.get(id);
    if (object?.controllerId !== playerId) continue;
    const options = [];
    if (object.aura && (object.manaCost ?? 0) <= (player.mana ?? 0)) options.push(false);
    if (object.bestow && (object.bestow.cost ?? 0) <= (player.mana ?? 0)) options.push(true);
    if (options.length === 0) continue;
    // Aura „Enchant player" (Curse): celem jest GRACZ, nie stwór — wybór celu
    // przez gracza (każdy gracz jest legalnym celem; przeciwnik zwykle cenniejszy).
    if (object.enchantPlayer) {
      for (const targetId of state.players.map((p) => p.id)) {
        for (const isBestow of options) out.push({ objectId: id, targetId, bestow: isBestow });
      }
      continue;
    }
    for (const targetId of state.zones.battlefield) {
      const target = state.objects.get(targetId);
      if (target && target.zone === 'battlefield' && target.kind === 'creature') {
        for (const bestow of options) out.push({ objectId: id, targetId, bestow });
      }
    }
  }
  return out;
}

/**
 * Zdolność obrócenia twarzą do góry dla face-down permanentu.
 * Megamorph (CR 702.109) kładzie przy obrocie licznik +1/+1; zwykły morph
 * (CR 702.37, Woolly Loxodon) obraca kartę za koszt morph BEZ licznika.
 */
function faceDownAbilities(object) {
  if (!object.morph) return [];
  if (object.morph.megamorphCost != null) {
    return [Object.freeze({
      type: 'activated',
      keyword: 'megamorph',
      cost: Object.freeze({ mana: object.morph.megamorphCost }),
      effect: Object.freeze({ type: 'turn_face_up', counters: { '+1/+1': 1 } }),
      trigger: null,
    })];
  }
  if (object.morph.morphCost != null) {
    return [Object.freeze({
      type: 'activated',
      keyword: 'morph',
      cost: Object.freeze({ mana: object.morph.morphCost }),
      effect: Object.freeze({ type: 'turn_face_up', counters: {} }),
      trigger: null,
    })];
  }
  return [];
}

export function playLand(state, playerId, objectId) {
  const player = state.players.find((entry) => entry.id === playerId);
  const object = state.objects.get(objectId);
  if (!player || !object || object.controllerId !== playerId || object.zone !== 'hand') throw new Error('Nielegalny land drop');
  if (object.kind !== 'land') throw new Error('Obiekt nie jest landem');
  if (state.turn.activePlayerId !== playerId || !['precombat_main', 'postcombat_main'].includes(state.turn.phase)) {
    throw new Error('Land drop poza main phase');
  }
  if (player.landPlays <= 0) throw new Error('Wykorzystano land drop w tej turze');
  const newId = `land-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'battlefield', newId);
  // Land z cechą „enters tapped" (Rupture Spire, Prismari Campus) wchodzi
  // zatapnięty — nie da się nim zatapnięć na manę w turze wejścia.
  const placed = moved.entersTapped ? Object.freeze({ ...moved, tapped: true }) : moved;
  state.objects.set(newId, placed);
  player.landPlays -= 1;
  const e = event('land_played', { playerId, fromId: objectId, object: placed, entersTapped: Boolean(placed.entersTapped) });
  state.events.push(e);
  return e;
}
