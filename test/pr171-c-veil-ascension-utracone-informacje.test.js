// PR #171 / C (zgłoszenie właściciela, 2026-10-21):
// „Gdy korzystam z efektów tej karty i wprowadzam Cloaked wierzchnią kartę to
// brakuje mi zarówno w sekcji »Rozgrywka« jak też w logu informacji jaką kartę
// w ten sposób zakryłem (muszę najechać na nią, żeby się tego dowiedzieć).”
//
// Zgłoszenie mówi o DWÓCH powierzchniach naraz, więc plik sprawdza obie oraz
// ich zgodność — rozbieżność etykiet w logu i na kaflu jest tym samym
// objawem co „karta znikająca z obu miejsc”, tylko w formie „nie podpisana”.
//
// Kryterium akceptacji (właściciel):
//   1. zakryta wierzchnia karta jest WIDOCZNA TRWALE w widoku pola bitwy,
//   2. jej tożsamość trafia do logu zdarzeń,
//   3. hover NIE jest jedynym nośnikiem informacji,
//   4. tożsamość zakrytej karty nie wycieka do widoku przeciwnika (CR 708.2a).
//
// Wszystko idzie przez PRODUKCJNĄ ścieżkę: prawdziwa `createSession`, prawdziwe
// rozstrzygnięcie triggera komendą `resolve_optional_trigger_choice(fire)`,
// prawdziwy `session.logTextAll()` i prawdziwy `cardInfo` na `session.view()`.
// Atrapy są tu błędem, nie skrótem — pierwsza wersja plinu podmieniała
// `describeEvent` własną atrapą i mogła „przechodzić” bez ruszania produkcji
// (albo odwrotnie: gonić za atrapą, której nie ma w kodzie).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, playerView } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { cardInfo } from '../src/table/render.js';

const REGISTRY = createCardRegistry();
const nameOf = (cardId) => REGISTRY.get(cardId)?.name ?? cardId;

/** Talia z Veiled Ascension {3}{W}; lądy białe dopełniają do 60. */
function talia() {
  return [
    'veiled-ascension',
    ...Array(10).fill('monastery-flock'),
    ...Array(24).fill('basic-plains'),
    ...Array(25).fill('basic-plains'),
  ];
}

/**
 * Scenariusz PRZEZ PRODUKCYJNĄ SESJĘ.
 *
 * Dlaczego nie `applyEffect` wprost: zdarzenia silnika docierają do logu stołu
 * WYŁĄCZNIE przez `session.apply` → `streamAutoEvents` (session.js:3618).
 * Bezpośredni `applyEffect` zostawia `state.events` nietknięte i log milczy.
 *
 * Dlaczego ręcznie `pendingOptionalTrigger`: trigger upkeepu zbiera się dopiero
 * przy realnym przejściu kroku, co wymagałoby rozegrania wielu tur przez obu
 * graczy (bot rozstrzyga własne triggery nie pokazując ich jako decyzji).
 * Ustawiamy go w DOKŁADNYM kształcie z `game-state.js:4516` — kluczem
 * uruchamiającym efekt jest `resolveEffect`, nie `ability.effect`; bez tego
 * komenda loguje samą decyzję („Korzystasz z efektu you may") i nic nie robi.
 */
function cloakWRealii() {
  const decks = new Map([[HUMAN_ID, talia()], [BOT_ID, talia()]]);
  const session = createSession({ seed: 8, registry: REGISTRY, decks });
  // Ręka otwarcia musi rozstrzygnięta, inaczej jedyne legalne komendy to
  // mulligan i trigger nigdy nie stanie się decyzją.
  for (const playerId of [HUMAN_ID, BOT_ID]) {
    for (let i = 0; i < 8; i += 1) {
      const cmd = (session.view().legalCommands ?? []).find((c) => c.type === 'resolve_mulligan_choice');
      if (!cmd) break;
      session.apply({ ...cmd, playerId, keep: true });
    }
  }
  const state = session.state;
  const def = REGISTRY.get('veiled-ascension');
  addObject(state, {
    id: 'src', instanceId: 'i-src', cardId: 'veiled-ascension',
    controllerId: HUMAN_ID, ownerId: HUMAN_ID, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [],
  });
  const ability = def.abilities.find((a) => a?.trigger?.mayFire) ?? def.abilities[0];
  state.pendingOptionalTrigger = {
    playerId: HUMAN_ID, sourceId: 'src', ability: Object.freeze({ ...ability }),
    resolveEffect: Object.freeze({ type: 'cloak' }),
    extra: Object.freeze({}), restorePriorityTo: BOT_ID,
  };
  const decision = (session.view().legalCommands ?? [])
    .find((c) => c.type === 'resolve_optional_trigger_choice');
  assert.ok(decision, 'trigger upkeepu musi być decyzją gracza');
  session.apply({ ...decision, playerId: HUMAN_ID, fire: true });

  const objectId = state.zones.battlefield.find((id) => state.objects.get(id).faceDown === true);
  assert.ok(objectId, 'zaakceptowany cloak musi wprowadzić zakrytą kartę na pole bitwy');
  return { session, state, objectId, object: state.objects.get(objectId) };
}

/** Nazwa zakrytej karty ze znacznikiem mechaniki i numerem kopii (CR 708.5). */
const etykieta = (object) => `${nameOf(object.cardId)} (Cloak ${object.copyNumber})`;

// C/1 — LOG: wpis o wejściu zakrytej karty niesie JEJ tożsamość dla właściciela.
test('C/1 (log): wejście zakrytej wierzchniej karty nazywa kartę właścicielowi', () => {
  const { session, object } = cloakWRealii();
  assert.equal(object.faceDownCause, 'cloak', 'przyczyna zakrycia to cloak, nie morph');
  const log = session.logTextAll();
  assert.match(log, /wchodzi na pole bitwy/,
    `brak wpisu o wejściu na pole bitwy: ${JSON.stringify(log)}`);
  assert.ok(log.includes(etykieta(object)),
    `log musi nazwać ZAKRYTĄ kartę „${etykieta(object)}"; log=${JSON.stringify(log)}`);
  // Ten sam wpis pojawia się dla nadania licznika flying (CR 701.58a) — obie
  // powierzchnie muszą mówić tę samą nazwę.
  assert.match(log, new RegExp(`${nameOf(object.cardId)} \\(Cloak 1\\) dostaje \\+1 licznik Latania`),
    `wpis o liczniku Latania też musi nazywać zakrytą kartę; log=${JSON.stringify(log)}`);
});

// C/2 — LOG: opis nie podpisuje zdarzenia nazwą ŹRÓDŁA cloaka (anty-regresja).
test('C/2 (anty-regresja): opis nie podpisuje wejścia zakrytej karty nazwą źródła', () => {
  const { session, object } = cloakWRealii();
  const log = session.logTextAll();
  assert.doesNotMatch(log, /Veiled Ascension \(Cloak 1\)/,
    `log podpisał wejście zakrytej karty nazwą źRÓDŁA (Veiled Ascension); log=${JSON.stringify(log)}`);
  assert.notEqual(nameOf(object.cardId), 'Veiled Ascension',
    'zakryta karta to wierzch biblioteki, nie źródło cloaka');
});

// C/3 — ROZGRYWKA: zakryty permanent jest w widoku właściciela, z nazwą.
test('C/3 (Rozgrywka): pole bitwy pokazuje zakrytą kartę właścicielowi z nazwą', () => {
  const { session, object, objectId } = cloakWRealii();
  const shown = session.view().zones.battlefield.find((o) => o.id === objectId);
  assert.ok(shown, 'zakryty permanent musi być w widoku pola bitwy (właściciel)');
  assert.equal(shown.faceDown, true, 'obiekt pozostaje zakryty');
  const info = cardInfo(session, shown);
  assert.equal(info.name, nameOf(object.cardId),
    `kafel musi pokazywać nazwę własnej zakrytej karty, było: ${info.name}`);
  assert.match(info.morphBadge ?? '', /Cloak/,
    `kafel musi nosić znacznik mechaniki cloak, było: ${info.morphBadge}`);
});

// C/4 — PRYWATNOŚĆ: przeciwnik nie dostaje cardId ani nazwy zakrytej karty.
test('C/4 (FoW): przeciwnik nie dostaje cardId ani nazwy zakrytej karty', () => {
  const { state, object, objectId } = cloakWRealii();
  const shown = playerView(state, BOT_ID).zones.battlefield.find((o) => o.id === objectId);
  assert.ok(shown, 'zakryty permanent nadal zajmuje pole bitwy u przeciwnika');
  assert.equal(shown.cardId, null, 'CR 708.2a: przeciwnik nie zna tożsamości');
  assert.doesNotMatch(JSON.stringify(shown), new RegExp(object.cardId, 'i'),
    'identyfikator zakrytej karty nie może wyciekać do widoku przeciwnika');
  assert.equal(shown.faceDown, true, 'zakrycie jest jawne (2/2 z wardem — CR 122.1b)');
});

// C/5 — TRWAŁOŚĆ: tożsamość nie znika przy kolejnym odczycie (to nie hover-only).
test('C/5 (trwałość): tożsamość zakrytej karty nie jest wyłącznie daniem hovera', () => {
  const { session, object, objectId } = cloakWRealii();
  const first = session.view().zones.battlefield.find((o) => o.id === objectId);
  const second = session.view().zones.battlefield.find((o) => o.id === objectId);
  assert.equal(first.cardId, object.cardId,
    'karta jest w widoku właściciela ZANIM cokolwiek zostanie najechane');
  assert.deepEqual(first.cardId, second.cardId,
    'karta pozostaje w widoku po kolejnym odczytaniu — informacja jest trwała');
  assert.equal(cardInfo(session, first).name, nameOf(object.cardId),
    'kafel sam (bez hovera) niesie nazwę zakrytej karty');
});

// C/6 — SPÓJNOŚĆ obu powierzchni: ta sama etykieta w logu i na kaflu.
test('C/6 (spójność): etykieta w logu i na kaflu zgadza się', () => {
  const { session, object, objectId } = cloakWRealii();
  const shown = session.view().zones.battlefield.find((o) => o.id === objectId);
  assert.ok(session.logTextAll().includes(etykieta(object)),
    `log musi użyć etykiety „${etykieta(object)}"`);
  assert.equal(cardInfo(session, shown).name, nameOf(object.cardId),
    'kafel pokazuje tę samą nazwę co etykieta w logu');
});