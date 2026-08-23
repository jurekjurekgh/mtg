// M163 — uwagi właściciela z testów (2026-08-20):
//
// A. Silumgar Butcher (Exploit): panel „Twoje działania" pokazywał N opcji
//    „Exploit (wybór poświęcenia)" — bez treści (kogo poświęcamy) i bez
//    grupowania. Klasa błędu: decyzja resolve_* bez case'a w commandLabel
//    (identyczne etykiety słownikowe + numerowanie) i bez klucza
//    choiceRequestGroupKey. Zlecenie obejmuje DOKŁADNY przegląd pozostałych
//    zdolności — stąd strażnik A3: KAŻDY typ komendy ma mieć etykietę
//    (case albo świadomy allowlist) i KAŻDA decyzja resolve_* klucz
//    grupowania (albo świadomy allowlist).
//
// W przeglądzie znalezione dodatkowo (te same objawy): resolve_color_choice,
//    resolve_land_type_choice, resolve_moonlit_choice, resolve_optional_draw,
//    resolve_optional_trigger_choice (identyczne etykiety wariantów) oraz
//    resolve_epic_choice (identyczne etykiety per cel — ta sama klasa co
//    suspend M151).
//
// B. Undercity: po utracie i ODZYSKANIU inicjatywy komunikat mówił
//    „obejmuje ją po raz pierwszy i zagłębia się w Podziemia" — nieprawda
//    (gracz nadal jest w lochu, pokój 3). Root cause: firstTime liczony jako
//    „zmiana posiadacza" (previous !== playerId), a nie „wejście do lochu
//    teraz" (undercityProgress == 0). Mechanika venture (awans pokoju przy
//    obejmowaniu inicjatywy) jest zgodna z CR 725.4 — błędna była treść
//    samego komunikatu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { commandLabel, buildActionEntries, choiceGroupTitle } from '../src/table/render.js';
import { COMMAND_TYPES } from '../src/protocol/types.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 163, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

const SESSION = {
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
  nameOfObject: (id) => id,
  cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
  colorsOf: (cardId) => REGISTRY.get(cardId)?.colors ?? [],
  abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
  log: [], reasoning: [], state: { seed: 1, objects: new Map() },
};
const strip = (text) => String(text).replace(/<[^>]*>/g, '');

// ---- A: Exploit — nazwy poświęcanych stworów + grupowanie --------------------

/** p1 rzuca Silumgar Butcher mając dwóch własnych stworów → decyzja exploit. */
function butcherExploitState() {
  const state = game('p1');
  putCard(state, 'guy1', 'highland-game', 'p1', 'battlefield');
  putCard(state, 'guy2', 'segmented-krotiq', 'p1', 'battlefield');
  return state;
}

test('A1: Exploit u GRACZA — opcje nazywają poświęcane stwory + skip, jedna grupa', () => {
  const state = butcherExploitState();
  putCard(state, 'butcher', 'silumgar-butcher', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'butcher');
  assert.ok(cast, 'oferta rzutu Butchera');
  assert.ok(execute(state, cast).ok);
  // Rozstrzygnięcie czaru-stwora + trigger exploit (decyzja kontrolera).
  for (let i = 0; i < 12; i += 1) {
    if (state.pendingExploits.length > 0) break;
    if (state.zones.stack.length > 0) {
      assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
      continue;
    }
    break;
  }
  assert.equal(state.pendingExploits.length, 1, 'decyzja exploit otwarta');

  const view = playerView(state, 'p1');
  const commands = view.legalCommands.filter((c) => c.type === 'resolve_exploit_choice');
  assert.ok(commands.length >= 3, 'kandydaci + skip w ofercie');
  const labels = commands.map((cmd) => strip(commandLabel(cmd, SESSION, view)));
  const sacrificeLabels = labels.filter((l) => l.includes('poświęć'));
  assert.ok(sacrificeLabels.length >= 2, `opcje poświęcenia nazywają stwora: [${labels}]`);
  assert.ok(sacrificeLabels.some((l) => l.includes('Highland Game')), `nazwa stwora w opcji: [${labels}]`);
  assert.ok(sacrificeLabels.some((l) => l.includes('Segmented Krotiq')), `nazwa drugiego stwora w opcji: [${labels}]`);
  assert.ok(labels.some((l) => !l.includes('poświęć')), 'wariant rezygnacji opisany');
  for (const label of labels) assert.ok(!/\(\d+ z \d+\)/.test(label), `bez numerowania w ciemno: ${label}`);
  assert.equal(new Set(labels).size, labels.length, 'etykiety rozróżnialne');

  // Grupowanie: wszystkie warianty w JEDNEJ grupie panelu „Twoje działania".
  const entries = buildActionEntries(commands, SESSION, view);
  const grouped = entries.filter((entry) => entry.request);
  assert.equal(grouped.length, 1, `warianty exploit w jednej grupie, a wpisów: ${entries.length}`);
  assert.equal(grouped[0].request.options.length, commands.length, 'grupa niesie wszystkie warianty');
  assert.equal(entries.filter((entry) => entry.command?.type === 'resolve_exploit_choice').length, 0,
    'brak luźnych, niezgrupowanych wpisów');
  const title = strip(choiceGroupTitle(grouped[0].request, SESSION, view));
  assert.ok(title.includes('Silumgar Butcher'), `tytuł grupy nazywa źródło: ${title}`);
});

// ---- A: pozostałe decyzje bez etykiet (przegląd zlecony przez właściciela) ----

test('A2: warianty decyzji tak/nie i wyborów mają ROZRÓŻNIALNE, opisowe etykiety', () => {
  const view = { players: [{ id: 'p1', name: 'Ty' }], zones: { battlefield: [], hand: [], stack: [], graveyard: [], library: [], exile: [] } };
  const cases = [
    [{ type: 'resolve_color_choice', playerId: 'p1', color: 'W' },
     { type: 'resolve_color_choice', playerId: 'p1', color: 'U' }],
    [{ type: 'resolve_land_type_choice', playerId: 'p1', landType: 'Plains' },
     { type: 'resolve_land_type_choice', playerId: 'p1', landType: 'Mountain' }],
    [{ type: 'resolve_moonlit_choice', playerId: 'p1', replace: true },
     { type: 'resolve_moonlit_choice', playerId: 'p1', replace: false }],
    [{ type: 'resolve_optional_draw', playerId: 'p1', draw: true },
     { type: 'resolve_optional_draw', playerId: 'p1', draw: false }],
    [{ type: 'resolve_optional_trigger_choice', playerId: 'p1', fire: true },
     { type: 'resolve_optional_trigger_choice', playerId: 'p1', fire: false }],
  ];
  for (const pair of cases) {
    const labels = pair.map((cmd) => strip(commandLabel(cmd, SESSION, view)));
    assert.equal(labels[0], labels[0].trim(), 'etykieta zdefiniowana');
    assert.notEqual(labels[0], labels[1], `warianty rozróżnialne: ${pair[0].type} → [${labels}]`);
    for (const label of labels) {
      assert.ok(!/resolve_/.test(label), `bez surowego identyfikatora (${pair[0].type}): ${label}`);
      assert.ok(label.length > 3, `etykieta opisowa (${pair[0].type}): ${label}`);
    }
  }
});

test('A3: strażnik etykiet i grupowania — każda komenda ma etykietę, każda decyzja grupę', () => {
  // Klasa błędu A (identyczne etykiety + brak grupowania) powtarza się przy
  // KAŻDYM nowym typie decyzji bez case'a w commandLabel / klucza w
  // choiceRequestGroupKey. Strażnik skanuje źródło render.js: nowy typ
  // MUSI trafić do commandLabel (albo świadomie na allowlist) i — dla
  // decyzji resolve_* — mieć klucz grupowania (albo świadomie na allowlist).
  const renderSrc = readFileSync(fileURLToPath(new URL('../src/table/render.js', import.meta.url)), 'utf8');
  const labelSrc = /export function commandLabel[\s\S]*?\n\}/.exec(renderSrc)[0];
  const groupSrc = /function choiceRequestGroupKey[\s\S]*?\n\}/.exec(renderSrc)[0];

  // Typy ŚWIADOMIE poza commandLabel (uzasadnienie w komentarzu przy liście):
  const LABEL_ALLOWLIST = new Set([
    'move_object', // tryb swobodny/diagnostyczny — poza normalną rozgrywką
  ]);
  for (const type of COMMAND_TYPES) {
    if (LABEL_ALLOWLIST.has(type)) continue;
    assert.ok(labelSrc.includes(`case '${type}':`),
      `commandLabel nie ma case '${type}' — opcje wyrenderują się z etykietą słownikową (klasa uwagi A). ` +
      'Dodaj case z nazwą karty/celu albo świadomie dopisz do LABEL_ALLOWLIST.');
  }

  // Decyzje resolve_* ŚWIADOMIE bez klucza grupowania (etykiety rozróżnialne
  // lub dedykowany przepływ): lista świadoma — nowy typ decyzji wielokrotnej
  // MUSI dostać klucz, inaczej panel pokazuje luźne, pozornie identyczne
  // przyciski (klasa uwagi A).
  const GROUP_ALLOWLIST = new Set([
    'resolve_combat', // dedykowany wizard walki
    'resolve_copy_targets', // etykiety nazywają cele
    'resolve_look_top_choice', // etykiety nazywają karty
    'resolve_satyr_look_choice', // etykiety nazywają lądy
    'resolve_suspend_cast', // etykieta zawiera cel (M151)
    'resolve_rebound_cast', // etykieta zawiera cel
    'resolve_reveal_choice', // etykiety nazywają karty
    'resolve_reveal_exile_hand', // etykiety nazywają karty
    'resolve_reveal_exile_grave', // etykiety nazywają karty
    'resolve_madness_cast', // cast/rezygnacja rozróżnialne + cel (M161)
  ]);
  for (const type of COMMAND_TYPES) {
    if (!type.startsWith('resolve_')) continue;
    if (GROUP_ALLOWLIST.has(type)) continue;
    assert.ok(groupSrc.includes(`'${type}'`),
      `choiceRequestGroupKey nie obejmuje '${type}' — warianty decyzji nie grupują się (klasa uwagi A). ` +
      'Dodaj klucz albo świadomie dopisz do GROUP_ALLOWLIST.');
  }
});

// ---- B: Undercity — komunikat „po raz pierwszy" po odzyskaniu inicjatywy ------

/** rzuca Underdark Explorer (ETB: take_initiative) — zwraca event initiative_taken. */
function castExplorer(state, playerId, id) {
  putCard(state, id, 'underdark-explorer', playerId, 'hand');
  addMana(state, playerId, 5, { colors: ['B'] });
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  const cast = playerView(state, playerId).legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === id);
  assert.ok(cast, `oferta rzutu ${id}`);
  assert.ok(execute(state, cast).ok);
  let initiative = null;
  for (let i = 0; i < 10; i += 1) {
    initiative = [...state.events].reverse().find((e) => e.type === 'initiative_taken') ?? initiative;
    if (initiative && state.zones.stack.length === 0 && state.pendingExploits.length === 0) break;
    if (state.zones.stack.length > 0) {
      assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
    } else break;
  }
  return initiative;
}

test('B1: ODZYSKANIE inicjatywy ≠ „po raz pierwszy" — firstTime tylko przy wejściu do lochu', () => {
  const state = game('p2');
  // 1) p2 obejmuje inicjatywę po raz pierwszy — wchodzi do lochu (pokój 1).
  const first = castExplorer(state, 'p2', 'ex1');
  assert.ok(first, 'event initiative_taken (p2, pierwsze objęcie)');
  assert.equal(first.playerId, 'p2');
  assert.equal(first.firstTime, true, 'pierwsze objęcie = wejście do Podziemi');
  assert.equal(state.undercityProgress.p2, 1, 'p2 w pokoju 1');
  // (scenariusz właściciela: p2 przeszedł 3 pokoje)
  state.undercityProgress = { ...state.undercityProgress, p2: 3 };
  // 2) p1 wyrywa inicjatywę — p1 wchodzi do lochu (swoje „po raz pierwszy").
  const second = castExplorer(state, 'p1', 'ex2');
  assert.equal(second.playerId, 'p1');
  assert.equal(second.firstTime, true, 'p1 enters the dungeon');
  assert.equal(state.undercityProgress.p2, 3, 'postęp p2 zachowany');
  // 3) p2 ODZYSKUJE inicjatywę — nadal jest w lochu (Lost Well) → NIE „po raz
  //    pierwszy"; venture rusza dalej (zachowanie CR 725.4).
  // M190/B: Lost Well ma DWIE drogi (Arena, Stash), więc venture otwiera
  // wybór ścieżki zamiast awansować automatycznie (CR 309.4).
  const regained = castExplorer(state, 'p2', 'ex3');
  assert.equal(regained.playerId, 'p2');
  assert.equal(regained.firstTime, false,
    `odzyskanie po utracie NIE jest „po raz pierwszy" (loch w toku), a było: ${JSON.stringify(regained)}`);
  assert.ok(state.pendingUndercityRoute, 'venture pyta o dalszą drogę z Lost Well');
  const route = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'resolve_undercity_route' && c.roomName === 'Arena');
  assert.ok(route, 'Arena jest jedną z dróg z Lost Well');
  assert.ok(execute(state, route).ok);
  assert.equal(state.undercityProgress.p2, 5, 'po wyborze gracz jest w Arenie');
});

test('B2: ukończony loch (9/9) — brak „po raz pierwszy" i brak dalszego venture', () => {
  const state = game('p1');
  state.undercityProgress = { p1: 9 };
  state.initiativePlayerId = 'p2';
  const taken = castExplorer(state, 'p1', 'ex1');
  assert.equal(taken.firstTime, false, 'loch ukończony — to nie jest pierwsze wejście');
  assert.equal(state.undercityProgress.p1, 9, 'brak pokoju 10');
});
