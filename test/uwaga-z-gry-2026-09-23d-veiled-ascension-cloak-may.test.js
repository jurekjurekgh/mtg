// F1 v2 (uwaga właściciela 2026-09-23d, po raporcie z sesji 2026-09-23c):
// „bot ma ZAWSZE wybierać »may« (cloak w upkeepie), chyba że biblioteka blisko
// wyczerpania (< 10 kart)”.
//
// Co było przed: `resolve_optional_trigger_choice` miało gałąź self-millu
// (M167/B) i fallback `fire ? 50 : 0`. Efekt `cloak` (CR 701.58a) NIE jest
// w `LIBRARY_DRAIN_EFFECTS`, więc strażnik kar bibliotecznych go nie widział —
// bot zakrywał kartę także przy bibliotece 1–5 kart (pomiar sondą: lib = 30,
// 12, 10, 9, 5, 3 → za każdym razem `fire`, 50 vs 0), czyli szedł prosto do
// deck-outu (CR 121.4), marnując zarazem realną wartość cloaka.
//
// Reguła po: cloak/manifest ZAMIENIA kartę biblioteki na permanenta 2/2
// z wardem {2} (karta nie ginie — jest wracalna twarzą do góry, CR 701.58b),
// więc bazowe „fire” zostaje na 50; kara wchodzi dopiero pod progiem
// `cloakLibraryFloor` (właściciel: 10) i schodzi pod „pass”. Wycena idzie po
// TYPIE efektu z widoku (ADR 0002 — zero nazw kart) i po parametrach (L41).
//
// Plik pinuje też: kontrakt widoku decyzji (M221/B — bez `ability`), próg
// dokładnie na granicy 10/9, działanie nadpisania parametru, brak regresji na
// drenażu biblioteki (Murder of Crows — wspólny czytnik efektów, L41) oraz
// anty-over-fix: „may” bez efektu bibliotecznego przy cienkiej bibliotece
// nadal odpala.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

const REGISTRY = createCardRegistry();
const BOT = 'p1';
const FIRE = 'resolve_optional_trigger_choice(fire)';
const SKIP = 'resolve_optional_trigger_choice(skip)';

/** Stan decyzji „you may” dokładnie w kształcie triggers.js (L21 pkt 3). */
function gra(ileKartWBibliotece, sourceCardId = 'veiled-ascension') {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', BOT);
  state.turn.activePlayerId = BOT;
  state.turn.priorityPlayerId = BOT;
  state.turn.phase = 'precombat_main';
  const def = REGISTRY.get(sourceCardId);
  addObject(state, {
    id: 'src', instanceId: 'i-src', cardId: sourceCardId, controllerId: BOT, ownerId: BOT,
    zone: 'battlefield', ...gameObjectDataOf(def), types: def.types ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
  const ląd = REGISTRY.get('basic-forest');
  for (let i = 0; i < ileKartWBibliotece; i += 1) {
    addObject(state, {
      id: `L${i}`, instanceId: `il-${i}`, cardId: 'basic-forest', controllerId: BOT,
      ownerId: BOT, zone: 'library', ...gameObjectDataOf(ląd), types: ląd.types ?? [],
    });
  }
  const ability = def.abilities.find((a) => a?.trigger?.mayFire) ?? def.abilities[0];
  state.pendingOptionalTrigger = {
    playerId: BOT, sourceId: 'src', ability: Object.freeze({ ...ability }),
    extra: Object.freeze({}), restorePriorityTo: 'p2',
  };
  return state;
}

function decyzjaBota(state, params = {}) {
  const bot = createHeuristicBot({ seed: 7, params });
  const chosen = bot.chooseCommand(playerView(state, BOT));
  const opcje = bot.trace().at(-1)?.options ?? [];
  const wynik = Object.fromEntries(opcje.map((o) => [o.cmd, o.score]));
  return { chosen, fire: wynik[FIRE] ?? null, skip: wynik[SKIP] ?? null };
}

test('F1v2/1 (kontrakt widoku): decyzja cloak = { sourceCardId, effect, effects }, bez `ability`', () => {
  const view = playerView(gra(12), BOT);
  const pending = view.pendingOptionalTrigger;
  assert.ok(pending, 'widok niesie pendingOptionalTrigger dla właściciela');
  assert.equal(pending.sourceCardId, 'veiled-ascension');
  assert.equal(pending.effect?.type, 'cloak', 'widok projektuje effect (pierwszy efekt zdolności)');
  assert.deepEqual(pending.effects, [{ type: 'cloak' }], 'pełna tablica effects jest w widoku');
  assert.equal('ability' in pending, false, 'widok nie wystawia `ability` — wycena nie może go czytać');
});

test('F1v2/2 (granica progu): biblioteka 30 i 10 → „may”, 9 i 1 → odmowa', () => {
  for (const lib of [30, 10]) {
    const { chosen, fire, skip } = decyzjaBota(gra(lib));
    assert.ok(fire > skip, `lib=${lib}: fire=${fire} musi wygrać z pass=${skip}`);
    assert.equal(chosen.type, 'resolve_optional_trigger_choice', `lib=${lib}: bot odpala cloak`);
    assert.equal(chosen.fire, true);
  }
  for (const lib of [9, 1]) {
    const { chosen, fire, skip } = decyzjaBota(gra(lib));
    assert.ok(fire < skip, `lib=${lib}: fire=${fire} musi przegrać z pass=${skip} (próg < 10)`);
    assert.equal(chosen.type, 'pass_priority', `lib=${lib}: odmowa = zwykły pass (F1)`);
    assert.notEqual(chosen.fire, true);
  }
});

test('F1v2/3 (L41): próg i kara to parametry — nadpisanie zmienia decyzję', () => {
  assert.equal(DEFAULT_HEURISTIC_PARAMS.cloakLibraryFloor, 10, 'próg właściciela: 10');
  assert.ok(DEFAULT_HEURISTIC_PARAMS.cloakThinLibraryPenalty > 50,
    'kara musi schodzić pod bazowe „fire” (50), inaczej „pass” nie wygra');
  const { chosen } = decyzjaBota(gra(9), { cloakLibraryFloor: 3 });
  assert.equal(chosen.fire, true, 'z progiem 3 biblioteka 9 kart nie karze cloaka');
});

test('F1v2/4 (anty-over-fix): cloak przy bibliotece 40 → odpala jak dotąd', () => {
  const { chosen } = decyzjaBota(gra(40));
  assert.equal(chosen.type, 'resolve_optional_trigger_choice');
  assert.equal(chosen.fire, true, 'zdrowa biblioteka: cloak to czysty zysk (2/2 z wardem)');
});

test('F1v2/5 (bez regresji, L41): drenaż biblioteki (Murder of Crows) dalej karany', () => {
  const { chosen, fire, skip } = decyzjaBota(gra(4, 'murder-of-crows'));
  assert.ok(fire < skip, `drenaż cienkiej biblioteki: fire=${fire} < pass=${skip}`);
  assert.equal(chosen.type, 'pass_priority');
});

test('F1v2/6 (anty-over-fix): inne „may” przy cienkiej bibliotece nadal odpala', () => {
  // Grazing Gladehart (landfall → +2 życie) nie rusza biblioteki, więc reguła
  // cloaków nie może go wyciszyć: gałąź kluczuje po TYPIE efektu, nie po samym
  // fakcie „decyzja you may przy cienkiej bibliotece”.
  const { chosen, fire, skip } = decyzjaBota(gra(1, 'grazing-gladehart'));
  assert.ok(fire > skip, `fire=${fire} musi wygrać z pass=${skip}`);
  assert.equal(chosen.fire, true);
});
