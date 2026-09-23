// Audyt PR #134 (2026-09-24), znaleziska F-1 i F-2 — Gond Gate (318 CLB).
//
// F-1 (wysoki): „{T}: Add {C}" produkowało kolory grupy Bram, bo
// `applyEffect` dla `add_mana` wracał do AGREGATU obiektu (`src.colors` =
// unia kolorów wszystkich zdolności `{T}`-only) nawet wtedy, gdy kontekst
// niósł deskryptor KONKRETNEJ zdolności bez `colors`/`colorsFrom`. Gałąź
// „produkcja bezbarwna" była martwa (effects.js:3378-3380; klasa L114/L159).
// Podstawa: CR 106.1b (sześć typów many, w tym bezbarwna) i CR 106.3 (mana
// pochodzi z efektu zdolności — „Add {C}" dodaje bezbarwną).
//
// F-2 (średni): „one mana of any color that a Gate you control could produce"
// liczyło kolory grupy wyłącznie z `effect.colors` deskryptorów, więc nie
// widziało (a) koloru WYBRANEGO przy wejściu (Manor Gate — `chosenColor`),
// (b) wewnętrznej zdolności many z podstawowego podtypu lądu (CR 305.6),
// (c) produkcji implikowanej mapą źródeł. Podstawa: CR 106.7 — „The type of
// mana a permanent could produce at any time includes any type of mana that
// an ability of that permanent would produce if the ability were to resolve
// at that time […] Ignore whether any costs of the ability could or could not
// be paid."
//
// Piny: G1 (F-1 RED→GREEN), G2 (kontrola — druga zdolność nadal {U}{B}),
// G3/G4/G5 (F-2), G6 (mutacja: koszt NIE jest ignorowany = Heap Gate nadal
// wnosi kolory — „Ignore whether any costs […] could be paid").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { getSourceForObject } from '../src/engine/mana-sources.js';

const registry = createCardRegistry();

function put(state, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

function game() {
  const state = createGameState({ seed: 134, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  return state;
}

/** Aktywacja wskazanej zdolności many Gond Gate (indeksy: 0 statyk, 1 = {C}, 2 = kolory Bram). */
function activateGond(state, abilityIndex) {
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'gond' && c.abilityIndex === abilityIndex);
  assert.ok(offer, `oferta activate_ability(gond, ${abilityIndex}) istnieje`);
  const result = execute(state, offer);
  assert.ok(result.ok, `komenda przyjęta: ${JSON.stringify(result.events)}`); // L68
  return result;
}

const lastManaColors = (state) => [...state.events].reverse().find((e) => e.type === 'mana_changed')?.colors ?? null;
const pool = (state) => state.players.find((p) => p.id === 'p1').manaPool;
const offered = (state, abilityIndex) => playerView(state, 'p1').legalCommands
  .some((c) => c.type === 'activate_ability' && c.objectId === 'gond' && c.abilityIndex === abilityIndex);

test('F-1/G1: Gond Gate „{T}: Add {C}" daje manę BEZBARWNĄ także przy kolorowej Bramie', () => {
  const state = game();
  put(state, 'gond', 'gond-gate', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'guild', 'dimir-guildgate', 'p1', 'battlefield', { summoningSickness: false });
  activateGond(state, 1);
  assert.deepEqual(lastManaColors(state), [], 'CR 106.1b/106.3: „Add {C}" = jeden typ bezbarwny, nie unia kolorów Bram');
  assert.deepEqual(pool(state), { '': 1 }, 'pula dostaje jednostkę bezbarwną, nie {U}{B}');
  assert.equal(state.objects.get('gond').tapped, true, 'zdolność tapie źródło (CR 602.2a)');
});

test('F-1/G2: kontrola — druga zdolność Gond Gate nadal daje kolory Bram', () => {
  const state = game();
  put(state, 'gond', 'gond-gate', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'guild', 'dimir-guildgate', 'p1', 'battlefield', { summoningSickness: false });
  activateGond(state, 2);
  assert.deepEqual(lastManaColors(state), ['U', 'B'], '„any color that a Gate you control could produce" = {U} albo {B}');
  assert.deepEqual(pool(state), { UB: 1 }, 'jednostka niebiesko-czarna w puli');
});

test('F-2/G3: kolor WYBRANY przy wejściu Bramy wchodzi do „could produce"', () => {
  const state = game();
  put(state, 'gond', 'gond-gate', 'p1', 'battlefield', { summoningSickness: false });
  // Manor Gate: „{T}: Add {G} or one mana of the chosen color" — wybór koloru
  // żyje na OBIEKCIE (`chosenColor`), nie w deskryptorze karty.
  put(state, 'manor', 'manor-gate', 'p1', 'battlefield', { summoningSickness: false, chosenColor: 'W' });
  assert.deepEqual(getSourceForObject(state.objects.get('manor'), state).colors, ['G', 'W'],
    'baza: Manor Gate produkuje {G} lub wybrany kolor');
  activateGond(state, 2);
  assert.deepEqual(lastManaColors(state), ['G', 'W'], 'CR 106.7: Gond Gate mógł dać {G} ALBO {W}');
  assert.deepEqual(pool(state), { WG: 1 }, 'jednostka biało-zielona w puli (klucz w kolejności WUBRG)');
});

test('F-2/G4: Brama bez deskryptora many (produkcja z mapy) wnosi kolor podtypu podstawowego', () => {
  const state = game();
  put(state, 'gond', 'gond-gate', 'p1', 'battlefield', { summoningSickness: false });
  // Basilisk Gate NIE ma deskryptora `add_mana` (jego „{T}: Add {C}" żyje
  // w mapie źródeł), a nadany podtyp podstawowy (typeGrant/efekt zmiany typu)
  // daje wewnętrzną zdolność „{T}: Add {B}" — CR 305.6, więc „could produce"
  // musi widzieć i produkcję implikowaną, i kolor z podtypu.
  put(state, 'basilisk', 'basilisk-gate', 'p1', 'battlefield', { summoningSickness: false, subtypes: ['Gate', 'Swamp'] });
  assert.ok(offered(state, 2), 'zdolność „any color…" jest dostępna (grupa ma kolor)');
  activateGond(state, 2);
  assert.deepEqual(lastManaColors(state), ['B'], 'kolor z podtypu podstawowego Bramy');
});

test('F-2/G4b: Brama Z deskryptorem też dokłada kolor nadanego podtypu podstawowego', () => {
  const state = game();
  put(state, 'gond', 'gond-gate', 'p1', 'battlefield', { summoningSickness: false });
  // Dimir Guildgate ma deskryptor `{T}: Add {U} or {B}`; nadany podtyp
  // podstawowy Mountain dokłada wewnętrzną zdolność „{T}: Add {R}" (CR 305.6),
  // więc unia „could produce" to {U}{B}{R} — osobny pin, bo odczyt deskryptora
  // i odczyt podtypu to DWA źródła kolorów (L13: mutacja per gałąź).
  put(state, 'guild', 'dimir-guildgate', 'p1', 'battlefield', { summoningSickness: false, subtypes: ['Gate', 'Mountain'] });
  activateGond(state, 2);
  assert.deepEqual(lastManaColors(state), ['U', 'B', 'R'], 'deskryptor {U}{B} + podtyp podstawowy {R}');
});

test('F-2/G4c: Brama z produkcją implikowaną (mapa źródeł, bez deskryptora i bez podtypu podstawowego)', () => {
  const state = game();
  put(state, 'gond', 'gond-gate', 'p1', 'battlefield', { summoningSickness: false });
  // Great Furnace („{T}: Add {R}" jako CAŁY tekst karty — produkcja z mapy
  // źródeł, bez deskryptora `add_mana`) z nadanym podtypem Gate: „could
  // produce" musi sięgnąć po produkcję implikowaną (pkt 4 odczytu), bo ani
  // deskryptor, ani podtyp podstawowy nic tu nie dają.
  put(state, 'furnace', 'great-furnace', 'p1', 'battlefield', { summoningSickness: false, subtypes: ['Gate'] });
  activateGond(state, 2);
  assert.deepEqual(lastManaColors(state), ['R'], 'kolor z produkcji implikowanej mapą źródeł');
});

test('F-2/G5: kontrola ujemna — bez koloru w grupie zdolność pozostaje niedostępna', () => {
  const state = game();
  put(state, 'gond', 'gond-gate', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'basilisk', 'basilisk-gate', 'p1', 'battlefield', { summoningSickness: false });
  assert.ok(!offered(state, 2), 'Basilisk Gate daje tylko {C} — nie ma koloru do wyprodukowania');
  assert.ok(offered(state, 1), '„{T}: Add {C}" pozostaje dostępne');
  const forced = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'gond', abilityIndex: 2 });
  assert.equal(forced.ok, false, 'walidacja tą samą bramką co oferta (L48)');
});

test('F-2/G6: koszt aktywacji NIE ogranicza „could produce" (CR 106.7)', () => {
  const state = game();
  put(state, 'gond', 'gond-gate', 'p1', 'battlefield', { summoningSickness: false });
  // Heap Gate: „{1}, {T}: Add one mana of any color" — koszt {1} ignorujemy,
  // więc grupa wnosi wszystkie pięć kolorów (zachowanie sprzed naprawy F-2).
  put(state, 'heap', 'heap-gate', 'p1', 'battlefield', { summoningSickness: false, tapped: true });
  activateGond(state, 2);
  assert.deepEqual(pool(state), { WUBRG: 1 }, 'dowolny kolor — tapnięta Brama z kosztem {1} też się liczy');
});
