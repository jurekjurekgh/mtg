// Numeracja kopii nazw na polu bitwy (zlecenie właściciela 2026-09-16).
//
// „Często na stole danego gracza pojawia się kilka permanentów z tą samą
// nazwą — np. tokeny albo lądy. […] Każdy permanent, który ma na stole
// danego gracza więcej niż jedną kopię powinien dostawać numer kolejny
// w nazwie — on i ta pierwsza kopia również. Zarówno pokazywanej na stole,
// jak i pokazywanej w modalach wyboru. Np. Island #1, Island #2 albo
// Soldier #1, Soldier #2 i Soldier #3."
//
// Reguła (systemowa, jedno źródło — L41):
//  - grupowanie per GRACZ (kontroler) po kluczu nazwy (object.name dla
//    tokenów, inaczej cardId), w kolejności wejścia na pole (kolejność
//    strefy battlefield);
//  - sufiks ` #N` dostaje KAŻDY członek grupy o liczności > 1 (także
//    pierwsza kopia); pojedyncze permanenty nie mają licznika;
//  - po odejściu kopii grupa się przelicza (ostatnia zostaje bez numeru);
//  - zakryte permanenty (face-down) i kopie (copyNumber — mają własny
//    wyróżnik „(kopia N)") nie biorą udziału w numeracji ani w liczniku;
//  - jedno źródło reguły: session.nameOfObject (modale, logi, etykiety
//    akcji) — kafel (cardInfo), etykiety akcji (commandLabel) i wizardy
//    (choice-request) delegują do niego dla widocznych obiektów pola bitwy.
//
// STRAŻNIK (N7): na stole jednego gracza NIGDY nie może być dwóch
// permanentów o jednakowej nazwie WYŚWIETLANEJ — pilnuje test unikalności
// po obu resolverach (nameOfObject i kafel cardInfo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createRegistry } from '../src/cards/registry.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { cardInfo, commandLabel } from '../src/table/render.js';
import { createSession, battlefieldNameNumbers, HUMAN_ID, BOT_ID } from '../src/table/session.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 46, players: [{ id: 'p1' }, { id: 'p2' }] });
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}, registry = REGISTRY) {
  const def = registry.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function soldierToken(state, controllerId, tag) {
  return createBattlefieldToken(state, controllerId, {
    cardId: 'token_soldier', name: 'Soldier', kind: 'creature',
    power: 1, toughness: 1, colors: ['W'], types: ['Creature'], subtypes: ['Soldier'],
    abilities: [], ...tag,
  });
}

const bfObjects = (state) => state.zones.battlefield.map((id) => state.objects.get(id));

// ---- Część 1: czysta funkcja ordynałów -----------------------------------

test('N1: trzy kopie jednej nazwy u jednego gracza → #1..#3 w kolejności wejścia; pojedynczy bez numeru', () => {
  const state = game();
  putCard(state, 'gate-a', 'manor-gate', 'p1');
  putCard(state, 'lone', 'highland-game', 'p1');
  putCard(state, 'gate-b', 'manor-gate', 'p1');
  putCard(state, 'gate-c', 'manor-gate', 'p1');
  const nums = battlefieldNameNumbers(bfObjects(state));
  assert.equal(nums.get('gate-a'), 1, 'pierwsza kopia też numerowana (#1)');
  assert.equal(nums.get('gate-b'), 2, 'kolejność wejścia, nie alfabetyczna id');
  assert.equal(nums.get('gate-c'), 3);
  assert.equal(nums.has('lone'), false, 'pojedynczy permanent bez numeru');
});

test('N2: grupowanie per GRACZ — kopie u dwóch graczy nie numerują się wzajemnie', () => {
  const state = game();
  putCard(state, 'mine', 'manor-gate', 'p1');
  putCard(state, 'foes', 'manor-gate', 'p2');
  const nums = battlefieldNameNumbers(bfObjects(state));
  assert.equal(nums.size, 0, 'po jednej kopii u każdego gracza → bez numerów');
});

test('N3: zakryte i kopie (copyNumber) poza numeracją i poza licznikiem grupy', () => {
  const state = game();
  putCard(state, 'gate-a', 'manor-gate', 'p1');
  putCard(state, 'hidden', 'manor-gate', 'p1');
  // face-down to stan nadawany efektem (nie kontraktem addObject) — jak B46/9
  state.objects.set('hidden', Object.freeze({ ...state.objects.get('hidden'), faceDown: true }));
  putCard(state, 'gate-b', 'manor-gate', 'p1');
  // kopia ma własny wyróżnik („(kopia N)”) i nie podbija licznika grupy
  const nums = battlefieldNameNumbers(bfObjects(state));
  assert.equal(nums.get('gate-a'), 1, 'jawne kopie numerowane między sobą');
  assert.equal(nums.get('gate-b'), 2);
  assert.equal(nums.has('hidden'), false, 'face-down bez numeru (własna konwencja M319/NA1)');
});

// ---- Część 2: sesja — nameOfObject (modale/logi/akcje) i kafel ----------

function sessionWithDuplicates() {
  const decks = new Map([
    [HUMAN_ID, parseDeckText(readFileSync('decks/innistrad-brg.txt', 'utf8'), REGISTRY).cardIds],
    [BOT_ID, parseDeckText(readFileSync('decks/innistrad-wu.txt', 'utf8'), REGISTRY).cardIds],
  ]);
  const session = createSession({ seed: 46, registry: REGISTRY, decks });
  const state = session.state;
  putCard(state, 'gate-a', 'manor-gate', HUMAN_ID);
  putCard(state, 'gate-b', 'manor-gate', HUMAN_ID);
  putCard(state, 'lone', 'highland-game', HUMAN_ID);
  soldierToken(state, HUMAN_ID);
  soldierToken(state, HUMAN_ID);
  soldierToken(state, HUMAN_ID);
  soldierToken(state, BOT_ID);
  soldierToken(state, BOT_ID);
  return session;
}

/**
 * O1 (audyt PR #124): katalog nie ma DZIŚ dwóch permanentów o tej samej nazwie
 * pod różnymi cardId, więc scenariusza nie da się zbudować realnymi kartami.
 * Rejestr z klonem Manor Gate (drugi „wydruk" — inny id, ta sama nazwa) daje
 * regule „grupa po nazwie WYŚWIETLANEJ" realne pokrycie dziś, zamiast czekania
 * na dopisanie karty do katalogu (blokada ADR 0029: lista właściciela).
 */
function sessionWithSameNameDifferentCards() {
  const real = createCardRegistry();
  const duplicate = { ...real.get('manor-gate'), id: 'manor-gate-second' };
  const registry = createRegistry([...real.all(), duplicate]);
  const decks = new Map([
    [HUMAN_ID, parseDeckText(readFileSync('decks/innistrad-brg.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(readFileSync('decks/innistrad-wu.txt', 'utf8'), registry).cardIds],
  ]);
  const session = createSession({ seed: 46, registry, decks });
  putCard(session.state, 'gate-a', 'manor-gate', HUMAN_ID, 'battlefield', {}, registry);
  putCard(session.state, 'gate-b', 'manor-gate-second', HUMAN_ID, 'battlefield', {}, registry);
  return session;
}

test('N4: nameOfObject numeruje kopie na polu bitwy (lądy i tokeny); pojedynczy bez sufiksu', () => {
  const session = sessionWithDuplicates();
  assert.equal(session.nameOfObject('gate-a'), 'Manor Gate #1');
  assert.equal(session.nameOfObject('gate-b'), 'Manor Gate #2');
  assert.equal(session.nameOfObject('lone'), 'Highland Game', 'pojedynczy bez licznika');
  const soldiers = session.state.zones.battlefield
    .map((id) => session.state.objects.get(id))
    .filter((o) => o.controllerId === HUMAN_ID && o.name === 'Soldier')
    .map((o) => session.nameOfObject(o.id));
  assert.deepEqual(soldiers.sort(), ['Soldier #1', 'Soldier #2', 'Soldier #3']);
  const botSoldiers = session.state.zones.battlefield
    .map((id) => session.state.objects.get(id))
    .filter((o) => o.controllerId === BOT_ID && o.name === 'Soldier')
    .map((o) => session.nameOfObject(o.id));
  assert.deepEqual(botSoldiers.sort(), ['Soldier #1', 'Soldier #2'], 'numeracja bota niezależna od gracza');
});

test('N5: kafel (cardInfo) i etykieta akcji (commandLabel) pokazują numerowaną nazwę', () => {
  const session = sessionWithDuplicates();
  const view = session.view();
  const entryA = view.zones.battlefield.find((o) => o.id === 'gate-a');
  assert.ok(entryA, 'obiekt w widoku');
  assert.equal(cardInfo(session, entryA).name, 'Manor Gate #1', 'nazwa na kaflu');
  const label = commandLabel(
    { type: 'tap_for_mana', playerId: HUMAN_ID, objectId: 'gate-a' },
    session,
    view,
  );
  assert.ok(label.includes('Manor Gate #1'), `etykieta akcji z numerem: ${label}`);
});

test('N6: po odejściu kopii grupa się przelicza — ostatnia kopia traci numer', () => {
  const session = sessionWithDuplicates();
  moveObjectDirectly(session.state, 'gate-a', 'graveyard', 'grv-gate-a');
  assert.equal(session.nameOfObject('gate-b'), 'Manor Gate', 'pojedyncza pozostała bez licznika');
  // tokeny: jeden Soldier ginie → zostają #1/#2 (przeliczenie od nowa)
  const soldierIds = session.state.zones.battlefield
    .filter((id) => session.state.objects.get(id).name === 'Soldier'
      && session.state.objects.get(id).controllerId === HUMAN_ID);
  moveObjectDirectly(session.state, soldierIds[0], 'graveyard', 'grv-soldier');
  const rest = soldierIds.slice(1).map((id) => session.nameOfObject(id));
  assert.deepEqual(rest.sort(), ['Soldier #1', 'Soldier #2'], 'przeliczenie po śmierci kopii');
});

// ---- Część 3: klucz grupowania = nazwa WYŚWIETLANA (O1 audytu PR #124) ---

test('N8/jednostka (O1): resolver nazwy wyświetlanej decyduje o grupie — różne cardId, jedna nazwa', () => {
  // Klasa defektu (O1 audytu PR #124): grupowanie po `o.name ?? o.cardId`
  // działa tylko dopóki nazwa wyświetlana == cardId. Reguła właściciela mówi
  // o NAZWIE, którą gracz widzi — dwa różne wydruki tego samego permanentu
  // muszą dostać „ #1"/„ #2" tak samo jak dwie kopie jednej karty.
  const objects = [
    { id: 'a', controllerId: 'p1', cardId: 'curate' },
    { id: 'b', controllerId: 'p1', cardId: 'curate-stx' },
  ];
  const nums = battlefieldNameNumbers(objects, () => 'Curate');
  assert.equal(nums.get('a'), 1, 'pierwszy wydruk numerowany');
  assert.equal(nums.get('b'), 2, 'drugi wydruk tej samej nazwy — #2');
  assert.equal(battlefieldNameNumbers(objects).size, 0,
    'bez resolvera (surowe cardId) stare zachowanie: brak grupy — dowód, że numeruje RESOLVER, nie przypadek');
});

test('N8 (O1, sesja): dwa RÓŻNE cardId o tej samej nazwie wyświetlanej numerują się jak kopie', () => {
  const session = sessionWithSameNameDifferentCards();
  assert.equal(session.nameOfObject('gate-a'), 'Manor Gate #1', 'pierwszy wydruk');
  assert.equal(session.nameOfObject('gate-b'), 'Manor Gate #2', 'drugi wydruk — ta sama nazwa wyświetlana');
  // Strażnik klasy N7 także na tym scenariuszu: po obu resolverach nazwy
  // permanentów jednego gracza są unikalne (kafel deleguje do sesji).
  const tileNames = session.state.zones.battlefield
    .map((id) => session.state.objects.get(id))
    .filter((o) => o.controllerId === HUMAN_ID)
    .map((o) => cardInfo(session, session.view().zones.battlefield.find((e) => e.id === o.id)).name);
  assert.equal(new Set(tileNames).size, tileNames.length, `duplikat na kaflach: ${tileNames.join(', ')}`);
});

// ---- Część 4: STRAŻNIK unikalności nazw wyświetlanych --------------------

test('N7/STRAŻNIK: nazwy wyświetlane permanentów jednego gracza są unikalne (modal i kafel)', () => {
  const session = sessionWithDuplicates();
  const state = session.state;
  const view = session.view();
  for (const owner of [HUMAN_ID, BOT_ID]) {
    const modalNames = state.zones.battlefield
      .map((id) => state.objects.get(id))
      .filter((o) => o.controllerId === owner)
      .map((o) => session.nameOfObject(o.id));
    assert.equal(new Set(modalNames).size, modalNames.length,
      `nameOfObject: duplikat nazwy u ${owner} — ${modalNames.join(', ')}`);
    const tileNames = view.zones.battlefield
      .filter((o) => o.controllerId === owner)
      .map((o) => cardInfo(session, o).name);
    assert.equal(new Set(tileNames).size, tileNames.length,
      `kafel: duplikat nazwy u ${owner} — ${tileNames.join(', ')}`);
  }
});
