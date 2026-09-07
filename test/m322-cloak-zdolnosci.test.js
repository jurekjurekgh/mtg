import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { applyEffect } from '../src/engine/effects.js';
import { turnFaceUp } from '../src/engine/permanents.js';
import { addMana } from '../src/engine/resources.js';

/**
 * M322 (audyt PR #102): zakrycie z `cloak` (Veiled Ascension, CR 701.56 —
 * keyword action) w dwóch miejscach rozmijało się z regułami.
 *
 * F0 — uncover NIE przywracał zdolności karty. Ścieżka cloaku skopiowała kształt
 * „trwałą twarzą w dół\" z rzutu morphem (puste `abilities` + migawka
 * `faceDownOriginal`), ale nie przeniosła migawki `originalAbilities`, którą
 * Batch 24 (Willbender) wprowadził dokładnie po to, żeby obrót nie zostawiał
 * permanentu bez zdolności. Zmierzone przed naprawą: cloak + uncover dawał
 * `abilities: []` dla karty z triggerem „when this creature is turned face up\".
 *
 * F9 — brak procedury obrotu za koszt morpha/disguise pod cloakem. CR 701.56c/d:
 * „If a card with morph is cloaked, its controller may turn that card face up
 * using either the procedure described in rule 702.37e … or the procedure
 * described above\". Skutek uboczny: sprzątanie śladów zakrycia (ward {2},
 * `cloakReady`, `cloakTurnUpCost`, numer kopii) leżało w handlerze komendy
 * `turn_cloak_face_up`, czyli w JEDNYM z dwóch punktów wejścia — obrót zdolnością
 * morpha zostawiał je na face-up permanencie (pole `ward` idzie do widoku i do
 * odznaki kafla, więc stwór po odsłonięciu nadal „miał\" ward {2}).
 *
 * F4 — przywracany ward brał się z twardego `ward: null`, nie z migawki. Dziś
 * żadna karta w katalogu nie ma drukowanego warda (zmierzone: 0 definicji), więc
 * to poprawny wynik z niepoprawnego źródła (klasa L104) — naprawione razem, bo
 * to ten sam punkt zbierający (`turnFaceUp`).
 *
 * Asercja zdolności idzie po faktach silnika (lista zdolności obiektu + trigger
 * `turned_face_up`), nie po nazwach kart (ADR 0002).
 */

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield', extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, morph: def.morph ?? null, ...extra,
  });
  return state.objects.get(id);
}

function game(cardId) {
  const state = createGameState({ seed: 322, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  put(state, 'va', 'veiled-ascension', 'p1');
  put(state, 'lib-0', cardId, 'p1', 'library');
  state.zones.library = ['lib-0'];
  applyEffect(state, { type: 'cloak' }, state.objects.get('va'), []);
  const cloak = state.zones.battlefield.map((id) => state.objects.get(id)).find((o) => o.faceDown);
  assert.ok(cloak, 'cloak utworzony');
  return { state, cloakId: cloak.id };
}

const abilityKeys = (list) => (list ?? []).map((a) => `${a?.keyword ?? a?.type}:${a?.trigger?.event ?? '-'}`);

// ---- A: zakryty klosz z morphem zna procedurę obrotu (CR 701.56c) ----------

test('M322/A1: cloak karty z morphem — zdolność obrotu za koszt morpha jest w ofercie', () => {
  const { state, cloakId } = game('willbender'); // Morph {1}{U}
  const cloak = state.objects.get(cloakId);
  assert.deepEqual(abilityKeys(cloak.abilities), ['morph:-'],
    `twarzą w dół: tylko procedura obrotu (708.2a tłumi druk, 701.56c zostawia morph): ${JSON.stringify(abilityKeys(cloak.abilities))}`);
  addMana(state, 'p1', 4, { colors: ['U'] });
  const view = playerView(state, 'p1');
  const entry = view.zones.battlefield.find((o) => o.id === cloakId);
  assert.equal((entry.activatableAbilities ?? []).length, 1, 'widok nosi procedure obrotu (własciciel zna swoja karte)');
  const morph = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === cloakId);
  assert.ok(morph, `oferta obrotu za morph: ${JSON.stringify(view.legalCommands.map((c) => c.type))}`);
  const r = execute(state, morph);
  assert.ok(r.ok, `obrot przyjęty: ${JSON.stringify(r)}`);
  const after = state.objects.get(cloakId);
  assert.equal(after.faceDown, false, 'twarz do góry zdolnością morpha');
  assert.equal(after.power, 1, `ciało karty (1/2), nie 2/2: ${after.power}/${after.toughness}`);
  assert.equal(after.toughness, 2, `ciało karty (1/2): ${after.power}/${after.toughness}`);
  // F9: ślady zakrycia sprząta punkt zbierający — nie handler `turn_cloak_face_up`
  assert.equal(after.ward ?? null, null, 'po obrocie NIE ma wardu zakrycia (701.56a: efekt konczy się przy obrocie)');
  assert.ok(!after.cloakReady, 'flaga cloak zdjęta niezależnie od procedury obrotu');
  assert.equal(after.cloakTurnUpCost ?? null, null, 'koszt obrotu skasowany');
  assert.equal(after.copyNumber ?? null, null, 'numer zakrycia nie zostaje na face-up karcie');
});

test('M322/A2: obrot za manę karty a obrot za morph — ten sam skutek na polach mechaniki', () => {
  const viaCard = game('willbender');
  addMana(viaCard.state, 'p1', 6, { colors: ['U'] });
  const cmd = playerView(viaCard.state, 'p1').legalCommands.find((c) => c.type === 'turn_cloak_face_up');
  assert.ok(cmd, 'oferta obrotu za koszt karty');
  assert.ok(execute(viaCard.state, cmd).ok, 'obrot za koszt karty przyjęty');
  const a = viaCard.state.objects.get(viaCard.cloakId);
  const viaMorph = game('willbender');
  addMana(viaMorph.state, 'p1', 4, { colors: ['U'] });
  const morphCmd = playerView(viaMorph.state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === viaMorph.cloakId);
  assert.ok(execute(viaMorph.state, morphCmd).ok, 'obrot za morph przyjęty');
  const b = viaMorph.state.objects.get(viaMorph.cloakId);
  for (const field of ['faceDown', 'ward', 'cloakReady', 'cloakTurnUpCost', 'copyNumber', 'power', 'toughness']) {
    assert.deepEqual(a[field] ?? null, b[field] ?? null, `pole ${field} musi wyglądać tak samo po obu procedurach`);
  }
});

// ---- B: uncover przywraca drukowane zdolności karty -------------------------

test('M322/B1: uncover cloaka przywraca zdolności karty (migawka originalAbilities)', () => {
  const { state, cloakId } = game('willbender');
  addMana(state, 'p1', 6, { colors: ['U'] });
  const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'turn_cloak_face_up');
  assert.ok(execute(state, cmd).ok, 'uncover przyjęty');
  const after = state.objects.get(cloakId);
  const printed = REGISTRY.get('willbender').abilities ?? [];
  assert.equal(after.abilities.length, printed.length,
    `po obrocie permanent ma zdolności karty (Batch 24 / Willbender): ${JSON.stringify(abilityKeys(after.abilities))}`);
  assert.ok(printed.length > 0, 'karta-sonda ma co odzyskać (test nie może byc vacuous)');
  assert.ok((after.abilities ?? []).some((a) => a?.trigger?.event === 'turned_face_up'),
    'trigger „when this creature is turned face up\" żyje po uncoverze');
  assert.equal(after.originalAbilities ?? null, null, 'migawka zużyta — nie wisi na obiekcie');
});

test('M322/B2: karta bez zdolności — uncover nie wymyśla zdolności i nie psuje cech', () => {
  const { state, cloakId } = game('goblin-piker'); // 2/1, bez zdolności
  addMana(state, 'p1', 4, { colors: ['R'] });
  const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'turn_cloak_face_up');
  assert.ok(cmd, 'goblin piker {1}{R} — oferta obrotu przy manie');
  assert.ok(execute(state, cmd).ok, 'uncover przyjęty');
  const after = state.objects.get(cloakId);
  assert.deepEqual(after.abilities ?? [], [], 'brak drukowanych zdolności = brak zdolności');
  assert.equal(after.power, 2, `ciało karty (2/1): ${after.power}/${after.toughness}`);
  assert.equal(after.toughness, 1, `ciało karty (2/1): ${after.power}/${after.toughness}`);
  assert.equal(after.ward ?? null, null, 'ward zakrycia zdjęty');
});

// ---- C: drukowany ward wraca z migawki, nie z „null\" (F4) ------------------

test('M322/C1: karta z drukowanym wardem — uncover przywraca ward z migawki', () => {
  // Karta syntetyczna w teście (ADR 0029 — katalog rośnie tylko z listy
  // właściciela): zakryty permanent z wardem zakrycia {2} nad drukowanym {1}.
  const state = createGameState({ seed: 323, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.priorityPlayerId = 'p1';
  addObject(state, {
    id: 'fd', instanceId: 'i-fd', cardId: 'goblin-piker', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 0,
    abilities: [], keywords: ['ward'], subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set('fd', Object.freeze({
    ...state.objects.get('fd'),
    faceDown: true,
    ward: 2, // ward zakrycia (nadpisany przez efekt cloaka)
    cloakReady: true,
    cloakTurnUpCost: 0,
    copyNumber: 1,
    faceDownOriginal: Object.freeze({
      colors: [], subtypes: [], types: ['Creature'], keywords: ['ward'], manaCost: 1,
      cardName: null, power: 2, toughness: 1, ward: 1, // DRUKOWANY ward karty
    }),
  }));
  const before = state.objects.get('fd');
  assert.equal(before.ward, 2, 'pod zakryciem: ward 2 (nadany przez cloak)');
  turnFaceUp(state, 'fd');
  const after = state.objects.get('fd');
  assert.equal(after.ward, 1, `ward karty (1) wraca z migawki, nie jest kasowany na siłę: ${after.ward}`);
  assert.ok(!after.cloakReady && after.cloakTurnUpCost == null && after.copyNumber == null,
    'ślady mechaniki skasowane w punkcie zbierającym');
});
