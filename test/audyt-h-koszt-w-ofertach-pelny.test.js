// Audyt H (uwaga właściciela 2026-09-23d, po sesji 2026-09-23c):
// „każda oferta bez podanego kosztu dozwolona WYŁĄCZNIE, gdy darmowa —
// przejrzeć cały silnik”. Pytanie właściciela po tej sesji: czy sprawdzono
// INNE czary/instanty/sorcery/aury/zdolności/wybory, ile poprawiono i czy
// idzie to jedną wspólną funkcją ofert (odpowiedź „jedna wspólna funkcja”
// jest dopuszczalna, ale musi być UDOWODNIONA).
//
// Ten plik pinuje DOWODY, na których stoi odpowiedź:
//
//  H/1  pokrycie typów komend: każdy typ z `COMMAND_TYPES` ma własną gałąź
//       etykiety w `commandLabel` — poza `move_object`, który jest komendą
//       protokołu/replayów (`game-state.js`, [w] „zostaje w protokole dla
//       zgodności replayów”) i nigdy nie powstaje jako oferta w `legalCommands`;
//  H/2  jedna funkcja: koszt karty liczy `cardCostHtml`, koszt zdolności
//       `abilityCostHtmlOf`(+`abilityCostSuffix`) — po JEDNEJ definicji,
//       używanej i przez etykiety pojedynczych ofert (`commandLabel`), i przez
//       tytuły grup decyzji (`choiceSourceTitle`/`choiceGroupTitle`/
//       `choiceGroupLabel`); ikony many renderuje jeden `manaCostHtml`;
//  H/3  strona silnika: oferta z nieopłacalnym kosztem nie powstaje wcale
//       (rzut za {R} bez many, zdolność za {2}{W} przy jednej Plains) —
//       ofertę tworzy tylko opłacalny wariant, więc „brak kosztu w etykiecie”
//       znaczy „darmowa”, a nie „nie wiadomo”;
//  H/4  PRZEBIEG PRODUKCYJNY (znalezisko tego audytu): F3 (2026-09-23c)
//       dodał koszt do etykiety obrotu twarzą do góry, ale etykieta czytała
//       pole z WIDOKU, a `playerView` go nie projektuje (koszt i prawo obrotu
//       to informacja właściciela zakrytej karty — FoW) ⇒ w prawdziwej partii
//       oferta dalej milczała o koszcie, a `turn_manifest_face_up` nie miała
//       kosztu nigdy. Test F3 przechodził, bo podawał koszt w ręcznie
//       zbudowanym widoku (klasa L1/ADR 0017 — dokładnie ta, którą F3
//       naprawiał). Naprawa: koszt czytany ze STANU, tym samym odczytem co
//       kreator płatności (M327, `main.js`) — dla cloaka i manifestu (L41);
//  H/5  FoW: widok przeciwnika nadal nie niesie ani kosztu, ani prawa obrotu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { applyEffect, manifestCardFaceDown } from '../src/engine/effects.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { buildActionEntries, choiceGroupTitle, commandLabel } from '../src/table/render.js';
import { COMMAND_TYPES } from '../src/protocol/types.js';

const REGISTRY = createCardRegistry();
const RENDER_SRC = fs.readFileSync('src/table/render.js', 'utf8');
const IKONY_SRC = fs.readFileSync('src/table/mana-icons.js', 'utf8');

/** Treść funkcji z `render.js` — do końca ciała na poziomie kolumny 0. */
function cialoFunkcji(nazwa) {
  const start = RENDER_SRC.indexOf(`function ${nazwa}(`);
  assert.ok(start > 0, `${nazwa} istnieje w render.js`);
  const koniec = RENDER_SRC.indexOf('\n}\n', start);
  assert.ok(koniec > start, `${nazwa} ma domknięcie ciała`);
  return RENDER_SRC.slice(start, koniec);
}

/** Treść `commandLabel` (anchor: gałąź `default` zamykająca switch). */
function cialoCommandLabel() {
  const start = RENDER_SRC.indexOf('export function commandLabel(');
  const stop = RENDER_SRC.indexOf('default: return REASONING_ACTION_LABELS[cmd.type] ?? cmd.type;', start);
  assert.ok(start > 0 && stop > start, 'commandLabel z gałęzią default');
  return RENDER_SRC.slice(start, RENDER_SRC.indexOf('\n}', stop));
}

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], spell: def.spell,
  });
}

function stol(step = 'main1') {
  const state = createGameState({ seed: 23, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  return state;
}

/** Sesja jak w produkcie: etykiety czytają z niej pełny stan (M327, `main.js`). */
const sesja = (state) => ({
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => state.objects.get(id)?.cardName ?? String(id),
  cardDetails: (id) => REGISTRY.get(id) ?? null,
  state,
  abilitiesOf: (id) => state.objects.get(id)?.abilities ?? REGISTRY.get(id)?.abilities ?? [],
});

const etykieta = (cmd, state, view) => commandLabel(cmd, sesja(state), view);

// ---------------------------------------------------------------------------
// H/1 — pokrycie typów komend
// ---------------------------------------------------------------------------

test('H/1: każdy typ komendy ma własną gałąź etykiety (poza komendą protokołu)', () => {
  const body = cialoCommandLabel();
  const cases = new Set([...body.matchAll(/\n\s*case '([^']+)':/g)].map((m) => m[1]));
  // Kontrola sanity: regex faktycznie widzi gałęzie znanych typów ofert.
  for (const typ of ['cast_spell', 'cast_permanent', 'activate_ability', 'play_land',
    'turn_cloak_face_up', 'resolve_pick']) {
    if (typ === 'resolve_pick') continue; // (nie istnieje — poza kontrolą)
    assert.ok(cases.has(typ), `ekstrakcja gałęzi widzi ${typ}`);
  }
  const bezGalezi = COMMAND_TYPES.filter((typ) => !cases.has(typ));
  assert.deepEqual(bezGalezi, ['move_object'],
    'typ bez gałęzi etykiety musi być komendą protokołu/replayów — każdy nowy typ oferty potrzebuje etykiety');
  const spozaProtokolu = [...cases].filter((typ) => !COMMAND_TYPES.includes(typ));
  assert.deepEqual(spozaProtokolu, [], 'gałąź etykiety dla typu, którego nie ma w protokole');
});

// ---------------------------------------------------------------------------
// H/2 — jedna wspólna funkcja ofert
// ---------------------------------------------------------------------------

test('H/2: koszt liczą WSPÓLNE formatery — jedna definicja, obie warstwy etykiet', () => {
  for (const nazwa of ['cardCostHtml', 'abilityCostHtmlOf', 'abilityCostSuffix']) {
    const definicje = [...RENDER_SRC.matchAll(new RegExp(`function ${nazwa}\\(`, 'g'))].length;
    assert.equal(definicje, 1, `${nazwa}: dokładnie jedna definicja (L41)`);
  }
  // Renderer ikon many mieszka w jednym module i jest IMPORTowany (nie kopiowany).
  assert.equal([...IKONY_SRC.matchAll(/function manaCostHtml\(/g)].length, 1,
    'manaCostHtml: jedna definicja (mana-icons.js)');
  assert.equal([...RENDER_SRC.matchAll(/function manaCostHtml\(/g)].length, 0,
    'render.js nie ma własnej kopii renderera ikon (L41)');
  assert.match(RENDER_SRC, /import \{[^}]*manaCostHtml[^}]*\} from '\.\/mana-icons\.js'/,
    'render.js importuje wspólny renderer ikon many');
  const pojedyncze = cialoCommandLabel();
  assert.match(pojedyncze, /const costOfCard = cardCostHtml;/,
    'etykieta pojedynczej oferty używa wspólnego formatera kosztu KARTY');
  assert.match(pojedyncze, /const abilityCostHtml = abilityCostHtmlOf;/,
    'etykieta pojedynczej oferty używa wspólnego formatera kosztu ZDOLNOŚCI');
  const tytulZrodla = cialoFunkcji('choiceSourceTitle');
  assert.match(tytulZrodla, /cardCostHtml\(/, 'tytuł decyzji („Cel czaru: X”) liczy koszt karty tym samym formaterem');
  assert.match(tytulZrodla, /abilityCostSuffix\(/, 'tytuł decyzji („…: Forecast”) liczy koszt zdolności tym samym formaterem');
  const tytulGrupy = cialoFunkcji('choiceGroupTitle');
  assert.match(tytulGrupy, /manaCostHtml\(/, 'tytuł grupy renderuje koszt wspólnym rendererem ikon many');
  assert.match(tytulGrupy, /choiceSourceTitle\(/, 'tytuł grupy deleguje do tytułu źródła (jedna ścieżka)');
  const wpisGrupy = cialoFunkcji('choiceGroupLabel');
  assert.match(wpisGrupy, /choiceGroupTitle\(/, 'wpis panelu (innerHTML) deleguje do tytułu grupy');
});

// ---------------------------------------------------------------------------
// H/3 — strona silnika: nieopłacalna oferta nie powstaje
// ---------------------------------------------------------------------------

function ofertyZMana(lands, hand, foe = 0) {
  const state = stol();
  lands.forEach((cardId, i) => put(state, `land-${i}`, cardId, 'p1', 'battlefield'));
  for (let i = 0; i < 5; i += 1) put(state, `lib-${i}`, 'basic-swamp', 'p1', 'library');
  hand.forEach((cardId, i) => put(state, `hand-${i}`, cardId, 'p1', 'hand'));
  for (let i = 0; i < foe; i += 1) put(state, `foe-${i}`, 'goblin-piker', 'p2', 'battlefield');
  return state;
}

test('H/3: rzut za {R} bez many NIE jest ofertą; z maną jest — i z kosztem w etykiecie', () => {
  const bezMany = ofertyZMana([], ['shock'], 1);
  const viewBez = playerView(bezMany, 'p1');
  assert.equal(viewBez.legalCommands.filter((c) => c.type === 'cast_spell').length, 0,
    'nieopłacalny rzut nie trafia do ofert (silnik tworzy tylko opłacalne warianty)');
  const zMana = ofertyZMana(['basic-mountain'], ['shock'], 1);
  const viewZ = playerView(zMana, 'p1');
  const cmd = viewZ.legalCommands.find((c) => c.type === 'cast_spell');
  assert.ok(cmd, 'z maną rzut jest ofertą');
  const label = etykieta(cmd, zMana, viewZ);
  assert.match(label, /koszt/, `oferta niesie koszt: ${label}`);
  assert.match(label, /ms-r/, 'koszt pokazany ikoną {R}');
});

test('H/3b: zdolność za {2}{W} przy jednej Plains NIE jest ofertą (Forecast)', () => {
  for (const [plains, czyOferta] of [[1, false], [3, true]]) {
    const state = stol('upkeep');
    for (let i = 0; i < plains; i += 1) put(state, `pl-${i}`, 'basic-plains', 'p1', 'battlefield');
    for (let i = 0; i < 5; i += 1) put(state, `lib-${i}`, 'basic-swamp', 'p1', 'library');
    put(state, 'hand-0', 'piercing-rays', 'p1', 'hand');
    put(state, 'foe-0', 'goblin-piker', 'p2', 'battlefield');
    const view = playerView(state, 'p1');
    const zdolnosci = view.legalCommands.filter((c) => c.type === 'activate_ability');
    assert.equal(zdolnosci.length > 0, czyOferta,
      `${plains} Plains: oferta zdolności ${czyOferta ? 'ma' : 'nie ma'} powstać`);
    if (czyOferta) {
      const label = etykieta(zdolnosci[0], state, view);
      assert.match(label, /koszt/, `oferta zdolności niesie koszt: ${label}`);
      assert.match(label, /ms-w/, 'ikona {W} w koszcie zdolności');
    }
  }
});

// ---------------------------------------------------------------------------
// H/4 — przebieg produkcyjny: oferta obrotu twarzą do góry niesie koszt
// ---------------------------------------------------------------------------

test('H/4: oferta „Obróć twarzą do góry (Cloak)” niesie koszt z PRAWDZIWEGO widoku', () => {
  const state = stol();
  put(state, 'lib-a', 'goblin-piker', 'p1', 'library');
  put(state, 'va', 'veiled-ascension', 'p1', 'battlefield');
  applyEffect(state, { type: 'cloak' }, state.objects.get('va'), []);
  addMana(state, 'p1', 4, {});
  const view = playerView(state, 'p1');
  const cmd = view.legalCommands.find((c) => c.type === 'turn_cloak_face_up');
  assert.ok(cmd, 'setup: oferta obrotu cloakiem');
  // Kontrola przyczyny (L1/ADR 0017): widok nie niesie kosztu obrotu — etykieta
  // MUSI go wziąć z pełnego stanu, inaczej w partii milczy (to był stan przed).
  assert.equal(view.zones.battlefield.find((o) => o.faceDown)?.cloakTurnUpCost, undefined,
    'widok nie projektuje kosztu obrotu (FoW)');
  assert.equal(state.objects.get(cmd.objectId).cloakTurnUpCost, 2, 'stan zna koszt ({1}{R})');
  const label = etykieta(cmd, state, view);
  assert.match(label, /koszt/i, `etykieta musi nieść koszt (F3 + H): ${label}`);
  assert.match(label, /ms-r/, 'ikona {R} w koszcie odkrycia');
  assert.match(label, /ms-c">1</, 'ikona {1} w koszcie odkrycia');
});

test('H/4b: oferta obrotu z MANIFESTU też niesie koszt (ta sama rodzina, L41)', () => {
  const state = stol();
  put(state, 'lib-a', 'goblin-piker', 'p1', 'library');
  const objekt = manifestCardFaceDown(state, 'lib-a', 'p1');
  addMana(state, 'p1', 4, {});
  const view = playerView(state, 'p1');
  const cmd = view.legalCommands.find((c) => c.type === 'turn_manifest_face_up');
  assert.ok(cmd, 'setup: oferta obrotu manifestem');
  assert.equal(state.objects.get(objekt).manifestTurnUpCost, 2, 'stan zna koszt ({1}{R})');
  const label = etykieta(cmd, state, view);
  assert.match(label, /koszt/i, `manifest też pokazuje koszt: ${label}`);
  assert.match(label, /ms-r/, 'ikona {R} w koszcie');
});

test('H/4c: darmowe akcje panelu nadal nie zmyślają kosztu', () => {
  const state = stol();
  for (let i = 0; i < 5; i += 1) put(state, `lib-${i}`, 'basic-swamp', 'p1', 'library');
  put(state, 'land-0', 'basic-forest', 'p1', 'hand');
  const view = playerView(state, 'p1');
  const session = sesja(state);
  for (const typ of ['pass_priority', 'play_land']) {
    const cmd = view.legalCommands.find((c) => c.type === typ);
    assert.ok(cmd, `setup: ${typ} jest ofertą`);
    const label = commandLabel(cmd, session, view);
    assert.doesNotMatch(label, /koszt/i, `${typ} jest darmowy — bez „koszt”: ${label}`);
  }
  const wpisy = buildActionEntries(view.legalCommands.filter((c) => c.type !== 'concede'), session, view);
  assert.ok(wpisy.length > 0, 'panel ma wpisy');
});

// ---------------------------------------------------------------------------
// H/5 — FoW: koszt i prawo obrotu zostają u kontrolera
// ---------------------------------------------------------------------------

test('H/5: widok przeciwnika nie zdradza kosztu ani prawa obrotu zakrytego permanentu', () => {
  const state = stol();
  put(state, 'lib-a', 'goblin-piker', 'p1', 'library');
  put(state, 'va', 'veiled-ascension', 'p1', 'battlefield');
  applyEffect(state, { type: 'cloak' }, state.objects.get('va'), []);
  const foe = playerView(state, 'p2').zones.battlefield.find((o) => o.faceDown);
  assert.ok(foe, 'przeciwnik widzi zakryty permanent (2/2 z wardem — informacja publiczna)');
  assert.equal(foe.cloakTurnUpCost, undefined, 'koszt obrotu jest prywatny (CR 708.2a)');
  assert.equal(foe.manifestTurnUpCost, undefined, 'koszt obrotu manifestu też');
  assert.equal(foe.cloakReady, undefined, 'prawo obrotu zna tylko kontroler (M315)');
  assert.ok(foe.cardId == null, 'tożsamość karty pod spodem ukryta');
  assert.equal(foe.faceDownCause, 'cloak', 'mechanika zakrycia jest jawna (CR 708.6)');
});
