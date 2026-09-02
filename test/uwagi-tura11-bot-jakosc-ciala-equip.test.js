// Tura 11 (2026-09-02), decyzja (e) właściciela z listy „świadomie nietknięte”:
//   „ważenie jakości ciała (ewazja) w ładunku sprzętu — rekomendacja: nie teraz”.
// Po M289 została para, która nadal wyglądała jak błąd:
//   - pompa na lataczu 3/3, kandydat vanilla 3/2 → przeniesienie ujemne (OK),
//   - pompa na vanilla 3/2, kandydat latacz 3/3 → TEŻ przeniesienie ujemne (ŹLE):
//     ciało z lataniem zbija pompę do +1/+0 tak samo dobrze, a jego cios i tak
//     przechodzi, więc przepłacenie {1} jest tu realną poprawką planszy.
//
// Zasada (M290), trzymana w JEDNYM miejscu (`equipValuation`, L121):
//   waga punktu siły = 1, jeśli ciało nie umie jej spożytkować w ataku
//                        (defender / detain / ochrona blokerów — M289),
//                  = 2, jeśli atak dojdzie, ale ścianę trzeba pokonać ręcznie,
//                  = 3, jeśli ciało ma WŁASNĄ ewazję, która ścianę omija
//                        (latanie albo „nie do zablokowania” przy blokerach bez
//                         latania/reacha — CR 702.9b).
// Antysymetria drabiny `wornByMine` jest nienaruszona: wartość wciąż jest funkcją
// pary (sprzęt, nosiciel, widok), a nie kierunku ruchu — poniższy test par
// sprawdza to na całej siatce 6 ciał × 2 sprzętów.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createGameState, execute, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId = 'p1') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `brak karty ${cardId} w katalogu`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(def),
    types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
    abilities: def.abilities ?? [], equipment: def.equipment,
    power: def.power, toughness: def.toughness,
  });
}

/**
 * Stan z samymi prawdziwymi kartami (L120): sprzęt `eqCard` przypięty do `worn`,
 * na polu bitwy `kreatury` (nasze) i `wrogowie` (ściana).
 */
function stow({ eqCard = 'wooden-stake', worn = null, creatury = [], wrogowie = [] } = {}) {
  const state = createGameState({ seed: 77, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 20, { W: 4, U: 4, B: 4, R: 4, G: 4 });
  addMana(state, 'p2', 2);
  put(state, 'eq', eqCard);
  for (const karta of creatury) put(state, karta, karta);
  for (const karta of wrogowie) put(state, karta, karta, 'p2');
  if (worn) state.objects.set('eq', Object.freeze({ ...state.objects.get('eq'), attachedTo: worn }));
  return state;
}

/** Oceny wszystkich ofert equipu sprzętu `eq` w bieżącym stanie stołu. */
function oceny(state) {
  const bot = createHeuristicBot({ seed: 1 });
  const pick = bot.chooseCommand(playerView(state, 'p1'), {});
  const opcje = bot.trace()[0].options;
  const equip = opcje
    .filter((o) => o.cmd.startsWith('activate_ability(eq'))
    .map((o) => ({ cel: (o.cmd.match(/->([\w-]+)/) ?? [null, null])[1], score: o.score, cmd: o.cmd }));
  return { pick, equip };
}

const cel = (r, nazwa) => r.equip.find((o) => o.cel === nazwa)?.score;
const placaZaEquip = (r) => r.pick.type === 'activate_ability' && r.pick.objectId === 'eq';

const CIALA = ['zoraline', 'undead-servant', 'highland-game', 'leafcrown-dryad', 'wishful-merfolk', 'monastery-flock'];

test('T11/1: pompa z vanilla 3/2 na latacz 3/3 to poprawka planszy, nie ruch boczny', () => {
  // Zoraline 3/3 z lataniem, Undead Servant 3/2 bez ewazji; Wooden Stake daje
  // +1/+0. Mierzone: +7,00 (przed M290 było −4,00).
  const r = oceny(stow({ worn: 'undead-servant', creatury: ['undead-servant', 'zoraline'] }));
  assert.equal(cel(r, 'zoraline'), 7, `latacz jako nowy nosiciel: ${cel(r, 'zoraline')}`);
  assert.ok(placaZaEquip(r), `bot płaci {1} za przeniesienie na lepsze ciało (wybrał: ${JSON.stringify(r.pick)})`);
});

test('T11/2: kierunek odwrotny (latacz → vanilla) zostaje karany', () => {
  const r = oceny(stow({ worn: 'zoraline', creatury: ['zoraline', 'undead-servant'] }));
  assert.ok(cel(r, 'undead-servant') < 0, `oddanie sprzętu z latacza musi być ujemne: ${cel(r, 'undead-servant')}`);
  assert.equal(placaZaEquip(r), false, `bot nie płaci za pogorszenie (wybrał: ${JSON.stringify(r.pick)})`);
});

test('T11/3: antysymetria na całej siatce par — żadna para nie jest dodatnia w obie strony', () => {
  for (const eqCard of ['wooden-stake', 'brawlers-plate']) {
    const tablica = new Map();
    for (const nosiciel of CIALA) {
      const kandydaci = CIALA.filter((x) => x !== nosiciel);
      const r = oceny(stow({ eqCard, worn: nosiciel, creatury: [nosiciel, ...kandydaci] }));
      for (const k of kandydaci) tablica.set(`${nosiciel}->${k}`, cel(r, k));
    }
    for (const [kierunek, wartosc] of tablica) {
      const [a, b] = kierunek.split('->');
      const odwrotny = tablica.get(`${b}->${a}`);
      assert.notEqual(odwrotny, undefined, `para ${b}->${a} też musi być zmierzona (${eqCard})`);
      assert.ok(!(wartosc > 0 && odwrotny > 0),
        `${eqCard}: ping-pong ${a} <-> ${b} (${wartosc} / ${odwrotny})`);
    }
  }
});

test('T11/4: premia zależy od ściany — bloker z reachem lub lataniem ją unieważnia', () => {
  const bezSciany = oceny(stow({ worn: 'undead-servant', creatury: ['undead-servant', 'zoraline'] }));
  const scianaReach = oceny(stow({
    worn: 'undead-servant', creatury: ['undead-servant', 'zoraline'], wrogowie: ['leafcrown-dryad'],
  }));
  const scianaLatanie = oceny(stow({
    worn: 'undead-servant', creatury: ['undead-servant', 'zoraline'], wrogowie: ['token_spirit_flying'],
  }));
  assert.ok(cel(bezSciany, 'zoraline') > 0, `bez ściany premia działa: ${cel(bezSciany, 'zoraline')}`);
  // Leafcrown Dryad ma reach, Spirit ma latanie — w obu przypadkach cios latacza
  // NIE omija blokady, więc ciało nie jest już lepsze od vanilla.
  assert.ok(cel(scianaReach, 'zoraline') < 0, `reach wroga kasuje premię: ${cel(scianaReach, 'zoraline')}`);
  assert.ok(cel(scianaLatanie, 'zoraline') < 0, `latanie wroga kasuje premię: ${cel(scianaLatanie, 'zoraline')}`);
});

test('T11/5: dwa równe vanilla ciała — żadna strona nie jest dodatnia (brak ping-ponga)', () => {
  const zLowa = oceny(stow({ worn: 'highland-game', creatury: ['highland-game', 'leafcrown-dryad'] }));
  const zGory = oceny(stow({ worn: 'leafcrown-dryad', creatury: ['leafcrown-dryad', 'highland-game'] }));
  assert.ok(cel(zLowa, 'leafcrown-dryad') <= 0, `${cel(zLowa, 'leafcrown-dryad')}`);
  assert.ok(cel(zGory, 'highland-game') <= 0, `${cel(zGory, 'highland-game')}`);
});

test('T11/6: regres M289 — defender i jałowy atak liczone po staremu', () => {
  // Wishful Merfolk (3/2 defender, nosi) → Zoraline: premii za ciało NIE ma, bo
  // nosiciel nie atakuje w ogole; wartosc plynie tylko z roznicy wag 1 vs 3.
  const r = oceny(stow({ worn: 'wishful-merfolk', creatury: ['wishful-merfolk', 'zoraline'] }));
  assert.equal(cel(r, 'zoraline'), 8, `defender → latacz: ${cel(r, 'zoraline')}`);
  const naDefendera = oceny(stow({ worn: 'zoraline', creatury: ['zoraline', 'wishful-merfolk'] }));
  assert.ok(cel(naDefendera, 'wishful-merfolk') < 0, `latacz → defender: ${cel(naDefendera, 'wishful-merfolk')}`);
});

test('T11/7: pierwsze założenie sprzętu nie jest przestawiane przez M290 (świadomy zakres)', () => {
  // Ściana FRESH: przy pierwszym założeniu waga dalej idzie od mocy nosiciela
  // (10 + 2*power), a nie od jakości ciała — dla pary vanilla 3/2 vs latacz 3/3
  // daje REMIS 18,00/18,00. To otwarta decyzja właściciela (patrz raport §14 i
  // backlog §3), nie przeoczenie: zmiana dotykałaby kilkudziesięciu pinów gałęzi
  // fresh, więc idzie osobnym commitem z osobnym benchmarkiem.
  const r = oceny(stow({ worn: null, creatury: ['undead-servant', 'zoraline'] }));
  const naVanilla = cel(r, 'undead-servant');
  const naLatacz = cel(r, 'zoraline');
  assert.ok(naVanilla > 0 && naLatacz > 0, `oba założenia są dodatnie: ${naVanilla} / ${naLatacz}`);
  assert.equal(naVanilla, naLatacz, 'gałąź fresh świadomie jeszcze nie waży jakości ciała');
});

test('T11/8: premię ciała liczy JEDNO miejsce i nie podwaja ewazji grantowanej przez sprzęt', () => {
  const src = fs.readFileSync('src/controllers/heuristic-bot.js', 'utf8');
  const start = src.indexOf('function equipValuation');
  assert.ok(start > 0, 'wspólna wycena ładunku istnieje');
  const cialo = src.slice(start, src.indexOf('\n  }', start));
  assert.equal((cialo.match(/const bearingEvasion =/g) ?? []).length, 1,
    'jakość ciała czytana raz (w definicji wyceny)');
  assert.equal((cialo.match(/hasKeyword\(creature, 'flying'\)/g) ?? []).length, 1,
    'latanie nosiciela nie może być liczone drugi raz w gałęzi equipu');
  // Ewazja GRANTOWANA przez sprzęt pozostaje w `ofensywne` — jeśli M290 weszłaby
  // też tam, pompa na tym samym kawałku byłaby liczona dwa razy.
  assert.match(cialo, /const ofensywne = creature\.cantAttackStatic === true \? 0 : \(\(grantsEvasion \? 8 : 0\) \+ \(hasteAdds \? 6 : 0\)\);/,
    'linia `ofensywne` nietknięta — premia ciała idzie w wagę siły, nie w granty');
  assert.equal((src.match(/const bearingEvasion =/g) ?? []).length, 1,
    'na całym pliku jest jedna definicja bearingEvasion');
});
