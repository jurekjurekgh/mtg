import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

// Zgłoszenie M (właściciel, 2026-11-07, Basilisk Gate): „{T}: Add {C}. {2}, {T}:
// Target creature gets +X/+X until end of turn, where X is the number of
// Gates you control. Activate only as a sorcery."
//
// Bot używał zdolności w Main 1 (słusznie — sorcery nie ma innego okna,
// PMSSB-59/B), ale na kreaturze, która potem NIE atakowała: +X/+X i {2}
// wyparowywały w cleanup (CR 514.2). Root cause: gałąź sorceryPump wymagała
// tylko „odbiorca MOŻE atakować" (canAttackNow) — wszystkie warianty celu
// remisowały na value = pGain+1 i bot brał pierwszy z enumeracji oferty
// (kolejność pola bitwy), a nie stwora, którym zamierza atakować.
//
// Reguła właściciela: „bezwzględnie buffować tylko te kreatury, które mają
// zaatakować w fazie combat". Implementacja: ten sam predykat zamiaru ataku
// co celowanie triggerów-pumpów (Battle-Rattle Shaman, A 2026-10-21e) —
// `zamiarAtakuWybranego` (najlepszy zestaw Z tym stworem musi bić najlepszy
// BEZ niego), liczony TĄ SAMĄ polityką ataku, którą bot stosuje w
// `declare_attackers` (L41/L48 — jedno źródło prawdy o zamiarze).

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, over = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone: 'battlefield',
    kind: data.kind, power: over.power ?? data.power, toughness: over.toughness ?? data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: def.abilities ?? [],
    keywords: over.keywords ?? def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: def.name,
  });
  if (over.summoningSickness) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: true }));
  }
}

/**
 * Plansza zgłoszenia: bot (p1) ma 2 bramy (X=2 → +2/+2), stwora ground 'a'
 * (3/3) i LATACZA 'b' (3/3); wróg ma 8/8 bez lotu. Polityka ataku wysyła
 * do ataku SAMEGO 'b' (atak 'a' to samobójstwo za 0 obrażeń), więc buff
 * na 'a' to dokładnie zgłoszony marnotrawny wariant.
 */
function game({ blocker = true, sick = false } = {}) {
  const state = createGameState({ seed: 44, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.turn.number = 6;
  put(state, 'gate1', 'basilisk-gate', 'p1');
  put(state, 'gate2', 'basilisk-gate', 'p1');
  put(state, 'a', 'ainok-tracker', 'p1', sick ? { summoningSickness: true } : {});
  put(state, 'b', 'jwar-isle-avenger', 'p1', sick ? { summoningSickness: true } : {});
  put(state, 'i1', 'basic-island', 'p1');
  put(state, 'i2', 'basic-island', 'p1');
  if (blocker) put(state, 'wurm', 'gorger-wurm', 'p2', { power: 8, toughness: 8 });
  return state;
}

const bot = () => createHeuristicBot({ seed: 44 });

/** Pełny przepływ tury bota: decyzja Main 1 → (aktywacja) → deklaracja ataku. */
function playOut(state) {
  const main = bot().chooseCommand(playerView(state, 'p1'));
  let buffedId = null;
  if (main.type === 'activate_ability') {
    buffedId = main.targets?.[0] ?? null;
    assert.ok(main.objectId === 'gate1' || main.objectId === 'gate2', 'aktywacja bramki, nie innego permanentu');
    assert.equal(execute(state, main).ok, true, 'aktywacja legalna');
    for (const pid of ['p1', 'p2']) {
      const pass = playerView(state, pid).legalCommands.find((c) => c.type === 'pass_priority');
      if (pass) execute(state, pass);
    }
  }
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  const declaration = bot().chooseCommand(playerView(state, 'p1'));
  const attackerIds = declaration.type === 'declare_attackers' ? declaration.attackerIds : [];
  return { main, buffedId, attackerIds };
}

test('M/1: sorcery-pump z bramki celuje wyłącznie w stwora, którym bot potem atakuje', () => {
  const { main, buffedId, attackerIds } = playOut(game());
  // Scenariusz ma sens: polityka ataku wysyła samego latającego 'b'.
  assert.deepEqual(attackerIds, ['b'], 'atak samym latającym (ground ginie od 8/8)');
  // Zgłoszenie: zdolność użyta (okno Main 1 jest jedyne dla sorcery).
  assert.equal(main.type, 'activate_ability', 'bot korzysta z okna Main 1 (PMSSB-59/B)');
  // Reguła właściciela — bezwzględnie: buffowany = przyszły atakujący.
  assert.ok(buffedId, 'aktywacja ma cel');
  assert.notEqual(buffedId, 'a', 'nie buffuje stwora, który zostaje w domu');
  assert.ok(attackerIds.includes(buffedId), 'buffowany stwór atakuje w tej turze');
});

test('M/2: anty-over-fix — przy zyskownym ataku bot nadal używa bramki (okno sorcery jedyne)', () => {
  // Pusty stół wroga: oba stwory atakują, więc każdy cel jest „zamierzonym
  // atakującym" — zdolność NIE może zniknąć z repertuaru (kara −26 tylko
  // dla odbiorców poza planem ataku).
  const { main, buffedId, attackerIds } = playOut(game({ blocker: false }));
  assert.equal(main.type, 'activate_ability', 'zdolność nadal używana na otwartym stole');
  assert.ok(attackerIds.includes(buffedId), 'buffowany stwór atakuje (tu: cała ekipa)');
  assert.deepEqual([...attackerIds].sort(), ['a', 'b'], 'otwarty stół = atak wszystkimi');
});

test('M/3: brak możliwego ataku (choroba przywoływania) — bot nie marnuje many', () => {
  // Oba stwory chore: w tej turze nie zaatakują, +X/+X wygaśnie w cleanup.
  // Reguła właściciela „bezwzględnie": żadnego buffa na nie-atakującego.
  const { main, attackerIds } = playOut(game({ sick: true }));
  assert.deepEqual(attackerIds, [], 'chore stwory nie atakują');
  assert.notEqual(main.type, 'activate_ability', 'brak aktywacji bez atakującego odbiorcy');
});
