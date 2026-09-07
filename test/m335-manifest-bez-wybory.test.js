import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * M335 (Żywy Tester stołu, talia celowana `audyt-manifest`, seed 4001,
 * 2026-09-07): partia zatrzymana na „Poddaj partię\", a w zgłoszeniach
 * detektora [rules]:
 *
 *   Komenda gracza odrzucona przez engine
 *   Dalej (pass) → Błąd wewnętrzny stołu: Pending spell odwołuje się do
 *   nieistniejącego czaru spell-39.
 *
 * Przyczyna leży w efekcie `manifest_dread` (CR 701.62a: „look at the top two
 * cards; manifest one, put the other into your graveyard\"). Rozstrzygacz
 * traktuje ZWROT PRAWDZIWY z efektu jako „czar czeka na decyzję gracza\"
 * (spells.js: `if (blocked) { state.pendingSpell = { stackId, effects: reszta };
 * return }`), a gałąź „w bibliotece jest dokładnie jedna karta\" — w której
 * żadnej decyzji NIE ma (manifestujemy ją bez wyboru) — kończyła się
 * `return true`. Efekt: zakrycie zaszło, ale `Manifest Dread` został na stosie
 * z `pendingSpell = { stackId, effects: [] }`. Nikt tego nie zdejmuje (delegat
 * `resolve_manifest_dread` nigdy nie powstaje), więc stos nie pustoszeje, czar
 * nie trafia do grobu, a każda kolejna próba oddania priorytetu wybucha
 * błędem wewnętrznym — partia wisi do koncesji.
 *
 * Gałąź „biblioteka pusta\" robi to poprawnie (`return;` — brak decyzji = brak
 * blokady), więc naprawa jest ujednoliceniem, nie nowym wynalazkiem. Fix
 * jednozdaniowy w src/engine/effects.js; ten plik pinuje obie gałęzie i to,
 * że gra po nich IDZIE DALEJ (a nie tylko że nie rzuca wyjątkiem w tym samym
 * kroku — pierwsza wersja testu sprawdzała tylko zakrycie i przeszłaby nawet
 * z wiszącym stosem).
 */

const REGISTRY = createCardRegistry();

function stateWithLibrary(cardIds) {
  const state = createGameState({ seed: 335, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 10);
  const def = REGISTRY.get('manifest-dread');
  addObject(state, {
    id: 'md', instanceId: 'i-md', cardId: 'manifest-dread', controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  cardIds.forEach((cardId, i) => {
    const d = REGISTRY.get(cardId);
    addObject(state, {
      id: `lib${i}`, instanceId: `i-lib${i}`, cardId, controllerId: 'p1', ownerId: 'p1', zone: 'library',
      ...gameObjectDataOf(d), types: d.types ?? [], keywords: d.keywords ?? [],
      subtypes: d.subtypes ?? [], spell: d.spell,
    });
  });
  state.zones.library = cardIds.map((_, i) => `lib${i}`);
  return state;
}

/** Rzuć Manifest Dread i dokończ rozstrzyganie (dwa pasy). */
function castAndResolve(state) {
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'md');
  assert.ok(cast, 'Manifest Dread do rzucenia');
  const r = execute(state, cast);
  assert.ok(r.ok, `rzut przyjęty: ${JSON.stringify(r.events?.slice(-1))}`);
  const out = [];
  for (const playerId of ['p1', 'p2', 'p1']) out.push(execute(state, { type: 'pass_priority', playerId }));
  return { state, passes: out };
}

test('M335/A: jedna karta w bibliotece — czar się KOŃCZY (stos pusty, brak pendingSpell)', () => {
  const { state, passes } = castAndResolve(stateWithLibrary(['razorfoot-griffin']));
  assert.equal(state.pendingSpell ?? null, null,
    `pendingSpell nie może zostać po ścieżce bez decyzji: ${JSON.stringify(state.pendingSpell)}`);
  assert.equal(state.zones.stack.length, 0, 'stos pusty — gra się toczy dalej');
  assert.equal(state.pendingManifestDread ?? null, null, 'żadna decyzja nie wisi (była 1 karta)');
  const covered = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.faceDown);
  assert.ok(covered, 'jedyna karta zmanifestowana (CR 701.62a „as many as possible\")');
  assert.equal(covered.faceDownCause, 'manifest', 'przyczyna zakrycia zapisana (M333)');
  assert.equal(covered.power, 2, 'face-down to 2/2 (CR 701.40a)');
  const graveyard = [...state.objects.values()].filter((o) => o.zone === 'graveyard').map((o) => o.cardId);
  assert.ok(graveyard.includes('manifest-dread'), `czar trafia do grobu: ${graveyard.join(',')}`);
  assert.ok(!graveyard.includes('razorfoot-griffin'), 'przy jednej karcie NIC nie idzie do grobu obok');
  for (const p of passes) assert.ok(p.ok, `pass po rozstrzygnięciu: ${p.reason}`);
});

test('M335/B: gra po tym IDZIE DALEJ — koniec tury i początek następnej bez błędu', () => {
  const { state } = castAndResolve(stateWithLibrary(['razorfoot-griffin', 'shock']));
  // Wybór z dwóch kart normalnie zamyka czar; tu tylko sprawdzamy, że po
  // decyzji można grać dalej (to jest sedno: dawniej wisi samo oddawanie
  // priorytetu po zakryciu z JEDNĄ kartą — stąd asercje w A).
  const choice = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_manifest_dread');
  assert.ok(choice, 'przy dwóch kartach decyzja jest oferowana');
  assert.ok(execute(state, choice).ok, 'wybór przyjęty');
  assert.equal(state.pendingSpell ?? null, null, 'po wyborze nic nie wisi na stosie');
  // Sedno: dawniej KAŻDE kolejne oddanie priorytetu po wiszącym `pendingSpell`
  // kończyło się błędem wewnętrznym stołu (i na tym partia stanęła —
  // transkrypt: „[STOP] brak akcji w kroku 50\"). Nie zakładamy tu tempa gry
  // (kroki boju mają własne komendy), tylko że silnik nadal przyjmuje akcje.
  for (let i = 0; i < 6; i++) {
    const viewer = state.turn.priorityPlayerId ?? 'p1';
    const cmd = playerView(state, viewer).legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(cmd, `priorytet jest u kogoś (${viewer}) — oferta pasa istnieje`);
    const r = execute(state, cmd);
    assert.ok(r.ok, `pass #${i} odrzucony: ${r.reason}`);
  }
  assert.equal(state.status, 'active', 'gra żyje');
  assert.equal(state.zones.stack.length, 0, 'stos pozostał pusty');
  assert.equal(state.pendingSpell ?? null, null, 'po 6 pasach nadal nic nie wisi');
});

test('M335/C: pusta biblioteka — czar się rozstrzyga bez zakrycia i bez blokady', () => {
  const { state } = castAndResolve(stateWithLibrary([]));
  assert.equal(state.pendingSpell ?? null, null, 'gałąź zerowa nigdy nie blokowała — pin przeciw regresji');
  assert.equal(state.zones.stack.length, 0, 'stos pusty');
  assert.equal([...state.objects.values()].some((o) => o.faceDown), false, 'nie ma czego zakryć');
});

test('M335/D: kontrakt „zwrot prawda = czeka na decyzję\" — gałąź bez decyzji nie może go użyć', () => {
  const source = readFileSync(new URL('../src/engine/effects.js', import.meta.url), 'utf8');
  const anchor = "if (effect.type === 'manifest_dread') {";
  const from = source.indexOf(anchor);
  assert.notEqual(from, -1, 'efekt manifest_dread istnieje');
  // Wycinek bloku przez równowagę nawiasów — bez liczenia linii (komentarze
  // regulaminowe rosną, a limit znaków fałszywie czerwienieje).
  let depth = 0; let end = from + anchor.length - 1;
  for (let i = from + anchor.length - 1; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const block = source.slice(from, end + 1);
  const returnsTrue = block.match(/return true;/g) ?? [];
  const pendings = block.match(/state\.pendingManifestDread = \{/g) ?? [];
  assert.equal(returnsTrue.length, pendings.length,
    'każde „return true\" w efekcie manifest_dread musi stawiać decyzję gracza '
    + `(znalezione zwroty: ${returnsTrue.length}, decyzje: ${pendings.length}) — `
    + 'inaczej czar wisi na stosie bez punktu, który mógłby go zdjąć (M335)');
});
